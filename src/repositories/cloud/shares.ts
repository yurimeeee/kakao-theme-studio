import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  type DocumentSnapshot,
  type QueryConstraint,
  type Timestamp,
} from 'firebase/firestore'
import { httpsCallable, type Functions } from 'firebase/functions'
import { deleteObject, listAll, ref, uploadBytes } from 'firebase/storage'
import { CloudError, toCloudError } from '@/cloud/errors'
import {
  createShareId,
  normalizeSearchText,
  ownerDisplayName,
  searchTokens,
  shareAssetPath,
  shareThumbnailPath,
  type AssetManifest,
  type Visibility,
} from '@/cloud/model'
import { THEME_NAME_MAX_LENGTH } from '@/domain/theme/defaults'
import { migrateConfig, removeAssetRefs } from '@/domain/theme/normalize'
import { activeAssetIds, resolveTheme } from '@/domain/theme/resolve'
import { CURRENT_SCHEMA_VERSION, type AssetId, type ThemeConfig } from '@/domain/theme/types'
import { CloudThemeRepository, downloadManifest, fetchBlob, requireUid, type CloudDeps, type CloudTheme } from './cloudThemes'

export type PublicVisibility = Exclude<Visibility, 'private'>

/** What anyone with the link (or the gallery) can read. */
export interface SharedTheme {
  id: string
  name: string
  ownerName: string
  visibility: PublicVisibility
  config: ThemeConfig
  assetManifest: AssetManifest
  exportThemeId: string
  revisionId: string
  thumbnailPath: string | null
  downloadCount: number
  publishedAt: number
  updatedAt: number
}

export type SharedThemeCard = Pick<SharedTheme, 'id' | 'name' | 'ownerName' | 'thumbnailPath' | 'downloadCount' | 'publishedAt'>

export type GallerySort = 'latest' | 'popular'

export interface GalleryPage {
  items: SharedThemeCard[]
  /** Opaque cursor for the next page; null when there are no more results. */
  next: DocumentSnapshot | null
}

export const GALLERY_PAGE_SIZE = 12

const millis = (t: unknown): number => {
  const ts = t as Timestamp | null | undefined
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : 0
}

function readShare(id: string, data: Record<string, unknown>): SharedTheme {
  return {
    id,
    name: String(data.name),
    ownerName: String(data.ownerName ?? ''),
    visibility: data.visibility === 'public' ? 'public' : 'unlisted',
    config: migrateConfig(data.config),
    assetManifest: (data.assetManifest as AssetManifest) ?? {},
    exportThemeId: String(data.exportThemeId),
    revisionId: String(data.revisionId ?? ''),
    thumbnailPath: (data.thumbnailPath as string | null) ?? null,
    downloadCount: typeof data.downloadCount === 'number' ? data.downloadCount : 0,
    publishedAt: millis(data.publishedAt),
    updatedAt: millis(data.updatedAt),
  }
}

export interface PublishOptions {
  /** Issue a new link: the old share document (and with it every old link) stops working. */
  rotateLink?: boolean
  /** Originals already in memory, keyed by SHA-256, to avoid downloading them again. */
  localBlobs?: ReadonlyMap<string, Blob>
}

/**
 * 공개 범위 and published snapshots.
 *
 * 비공개 means "no share document". 공개 / 링크 공개 publish a *copy* of the active revision
 * under shares/{shareId}: only the images the theme actually uses (inactive originals are
 * not published), readable through rules while the share document exists. Turning a theme
 * 비공개, changing its link or deleting it removes the share document first, which blocks
 * the old link and its files immediately; file cleanup follows (onShareDeleted function).
 */
export class ShareRepository {
  private readonly deps: CloudDeps & { functions: Functions }
  private readonly themes: CloudThemeRepository

  constructor(deps: CloudDeps & { functions: Functions }) {
    this.deps = deps
    this.themes = new CloudThemeRepository(deps)
  }

  async setVisibility(themeId: string, visibility: Visibility, options: PublishOptions = {}): Promise<{ shareId: string | null }> {
    const { db } = this.deps
    requireUid(this.deps.auth)
    try {
      const theme = await this.themes.get(themeId)
      if (!theme) throw new CloudError('not-found', 'Theme not found')
      const themeRef = doc(db, 'themes', themeId)

      if (visibility === 'private') {
        if (theme.shareId) await deleteDoc(doc(db, 'shares', theme.shareId))
        await updateDoc(themeRef, { visibility: 'private', shareId: null })
        return { shareId: null }
      }

      const reuse = theme.shareId && !options.rotateLink ? await this.existingShare(theme.shareId) : null
      const shareId = reuse ? theme.shareId! : createShareId()
      await this.publishSnapshot(shareId, theme, visibility, reuse !== null, options.localBlobs)
      if (theme.shareId && theme.shareId !== shareId) {
        await deleteDoc(doc(db, 'shares', theme.shareId)).catch(() => undefined)
      }
      await updateDoc(themeRef, { visibility, shareId })
      return { shareId }
    } catch (error) {
      throw toCloudError(error)
    }
  }

  /** Re-publishes the active revision to the existing share (after a cloud save of a shared theme). */
  async syncPublished(themeId: string, localBlobs?: ReadonlyMap<string, Blob>): Promise<void> {
    const theme = await this.themes.get(themeId)
    if (!theme || theme.visibility === 'private') return
    await this.setVisibility(themeId, theme.visibility, { localBlobs })
  }

  private async existingShare(shareId: string): Promise<Record<string, unknown> | null> {
    const snap = await getDoc(doc(this.deps.db, 'shares', shareId)).catch(() => null)
    return snap?.exists() ? snap.data() : null
  }

  private async publishSnapshot(
    shareId: string,
    theme: CloudTheme,
    visibility: PublicVisibility,
    exists: boolean,
    localBlobs?: ReadonlyMap<string, Blob>,
  ): Promise<void> {
    const { db, storage, auth } = this.deps
    const uid = requireUid(auth)
    const shareRef = doc(db, 'shares', shareId)

    // Publish only what the theme uses; inactive originals stay private.
    const active = activeAssetIds(resolveTheme(theme.config))
    const inactive = new Set(Object.keys(theme.assetManifest).filter((id) => !active.has(id)))
    const config = removeAssetRefs(theme.config, inactive)
    const base = {
      ownerId: uid,
      themeId: theme.id,
      visibility,
      name: theme.name.slice(0, THEME_NAME_MAX_LENGTH),
      ownerName: ownerDisplayName(auth.currentUser?.displayName),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportThemeId: theme.exportThemeId,
      revisionId: theme.activeRevisionId,
      searchTokens: searchTokens(theme.name),
      updatedAt: serverTimestamp(),
    }
    if (!exists) {
      // Storage rules authorize uploads against this document, so it must exist first.
      await setDoc(shareRef, {
        ...base,
        status: 'preparing',
        config,
        assetManifest: {},
        thumbnailPath: null,
        downloadCount: 0,
        publishedAt: serverTimestamp(),
      })
    }

    const manifest: AssetManifest = {}
    const copied = new Set<string>()
    for (const id of active) {
      const entry = theme.assetManifest[id]
      if (!entry) throw new CloudError('missing-asset', `Asset ${id} missing from manifest`)
      const path = shareAssetPath(shareId, entry.hash, entry.ext)
      manifest[id] = { ...entry, path }
      if (copied.has(path)) continue
      copied.add(path)
      const blob = localBlobs?.get(entry.hash) ?? (await fetchBlob(storage, entry.path, entry.mime))
      await uploadBytes(ref(storage, path), blob, { contentType: entry.mime })
    }
    let thumbnailPath: string | null = null
    if (theme.thumbnailPath) {
      thumbnailPath = shareThumbnailPath(shareId, theme.activeRevisionId)
      const thumb = await fetchBlob(storage, theme.thumbnailPath, 'image/png')
      await uploadBytes(ref(storage, thumbnailPath), thumb, { contentType: 'image/png' })
    }

    await updateDoc(shareRef, { ...base, status: 'ready', config, assetManifest: manifest, thumbnailPath })

    // Remove published files the new snapshot no longer uses.
    const keep = new Set([...Object.values(manifest).map((a) => a.path), thumbnailPath].filter(Boolean) as string[])
    for (const folder of ['assets', 'thumbnails']) {
      const listing = await listAll(ref(storage, `shares/${shareId}/${folder}`)).catch(() => null)
      for (const item of listing?.items ?? []) {
        if (!keep.has(item.fullPath)) await deleteObject(item).catch(() => undefined)
      }
    }
  }

  /** Anyone (signed in or not). null when the link is unknown, 비공개 or deleted. */
  async get(shareId: string): Promise<SharedTheme | null> {
    try {
      const snap = await getDoc(doc(this.deps.db, 'shares', shareId))
      if (!snap.exists()) return null
      const data = snap.data()
      if (data.status !== 'ready') return null
      return readShare(snap.id, data)
    } catch (error) {
      const e = toCloudError(error)
      if (e.kind === 'permission' || e.kind === 'not-found') return null
      throw e
    }
  }

  /** Downloads the images a shared theme uses. */
  downloadAssets(share: SharedTheme): Promise<Map<AssetId, Blob>> {
    return downloadManifest(this.deps.storage, share.assetManifest)
  }

  downloadThumbnail(path: string): Promise<Blob> {
    return fetchBlob(this.deps.storage, path, 'image/png')
  }

  /**
   * 공개 themes only. Search matches a substring of the theme name (see searchTokens);
   * the same filter applies to every page, so pagination stays consistent.
   */
  async gallery(options: { sort: GallerySort; search?: string; after?: DocumentSnapshot | null; pageSize?: number }): Promise<GalleryPage> {
    const pageSize = options.pageSize ?? GALLERY_PAGE_SIZE
    const term = normalizeSearchText(options.search ?? '')
    if (term.length > THEME_NAME_MAX_LENGTH) return { items: [], next: null }
    const constraints: QueryConstraint[] = [where('visibility', '==', 'public'), where('status', '==', 'ready')]
    if (term) constraints.push(where('searchTokens', 'array-contains', term))
    if (options.sort === 'popular') constraints.push(orderBy('downloadCount', 'desc'))
    constraints.push(orderBy('publishedAt', 'desc'))
    if (options.after) constraints.push(startAfter(options.after))
    constraints.push(limit(pageSize + 1))
    try {
      const snap = await getDocs(query(collection(this.deps.db, 'shares'), ...constraints))
      const docs = snap.docs.slice(0, pageSize)
      return {
        items: docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            name: String(data.name),
            ownerName: String(data.ownerName ?? ''),
            thumbnailPath: (data.thumbnailPath as string | null) ?? null,
            downloadCount: typeof data.downloadCount === 'number' ? data.downloadCount : 0,
            publishedAt: millis(data.publishedAt),
          }
        }),
        next: snap.docs.length > pageSize ? docs[docs.length - 1] : null,
      }
    } catch (error) {
      throw toCloudError(error)
    }
  }

  /**
   * Counts a download for 인기순. Best effort and server-side: the function de-duplicates
   * per account / client per day, and clients cannot write downloadCount (rules).
   */
  async recordDownload(shareId: string): Promise<void> {
    await httpsCallable(this.deps.functions, 'recordDownload')({ shareId }).catch(() => undefined)
  }
}
