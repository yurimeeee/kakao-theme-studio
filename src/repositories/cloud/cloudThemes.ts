import type { Auth } from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore'
import { deleteObject, getBytes, getMetadata, listAll, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage'
import type { AssetRecord } from '@/assets/types'
import { CloudError, toCloudError } from '@/cloud/errors'
import {
  createRevisionId,
  EXT_BY_MIME,
  userAssetPath,
  userThumbnailPath,
  type AssetManifest,
  type CloudAssetEntry,
  type Visibility,
} from '@/cloud/model'
import { collectAssetIds, migrateConfig } from '@/domain/theme/normalize'
import { CURRENT_SCHEMA_VERSION, type AssetId, type ThemeConfig, type ThemeProject } from '@/domain/theme/types'

export type CloudAssetSource = Pick<AssetRecord, 'blob' | 'mime' | 'width' | 'height' | 'size' | 'hash' | 'name'>

export interface CloudThemeSummary {
  id: string
  name: string
  visibility: Visibility
  shareId: string | null
  updatedAt: number
  thumbnailPath: string | null
}

export interface CloudTheme extends CloudThemeSummary {
  ownerId: string
  activeRevisionId: string
  previousRevisionId: string | null
  exportThemeId: string
  config: ThemeConfig
  assetManifest: AssetManifest
  createdAt: number
}

export interface CloudSaveResult {
  themeId: string
  revisionId: string
  ownerId: string
  visibility: Visibility
  shareId: string | null
}

export interface CloudDeps {
  db: Firestore
  storage: FirebaseStorage
  auth: Auth
}

/** Orphaned uploads younger than this are left alone: another device may be mid-save. */
export const ORPHAN_GRACE_MS = 10 * 60 * 1000

const millis = (t: unknown, fallback = 0): number => {
  const ts = t as Timestamp | null | undefined
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : fallback
}

export function requireUid(auth: Auth): string {
  const uid = auth.currentUser?.uid
  if (!uid) throw new CloudError('unauthenticated', 'Not signed in')
  return uid
}

function readTheme(id: string, data: Record<string, unknown>): CloudTheme {
  let config: ThemeConfig
  try {
    config = migrateConfig(data.config)
  } catch (error) {
    throw new CloudError('unknown', `Theme ${id} config unreadable`, error)
  }
  return {
    id,
    ownerId: String(data.ownerId),
    name: String(data.name),
    visibility: (data.visibility as Visibility) ?? 'private',
    shareId: (data.shareId as string | null) ?? null,
    activeRevisionId: String(data.activeRevisionId),
    previousRevisionId: (data.previousRevisionId as string | null) ?? null,
    exportThemeId: String(data.exportThemeId),
    config,
    assetManifest: (data.assetManifest as AssetManifest) ?? {},
    thumbnailPath: (data.thumbnailPath as string | null) ?? null,
    createdAt: millis(data.createdAt),
    updatedAt: millis(data.updatedAt, Date.now()),
  }
}

/**
 * Account-owned cloud copies of themes. Called ONLY from explicit 저장 / 내보내기
 * confirmation (and the user's own 내 테마 actions) — never from autosave or editing.
 *
 * Save protocol (uploads and the Firestore write are not one atomic transaction):
 *  1. upload new originals (content-addressed by SHA-256, so retries are idempotent)
 *  2. upload the thumbnail for the new revision
 *  3. one Firestore transaction: verify the base revision, write the revision document
 *     and promote it to `activeRevisionId`
 *  4. best-effort cleanup of files no longer referenced by the active or previous revision
 * A failure before 3 leaves the previous revision untouched and active; files it uploaded
 * are orphans removed by a later cleanup.
 */
export class CloudThemeRepository {
  private readonly deps: CloudDeps

  constructor(deps: CloudDeps) {
    this.deps = deps
  }

  async list(): Promise<CloudThemeSummary[]> {
    const uid = requireUid(this.deps.auth)
    try {
      const snap = await getDocs(
        query(collection(this.deps.db, 'themes'), where('ownerId', '==', uid), orderBy('updatedAt', 'desc'), limit(200)),
      )
      return snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          name: String(data.name),
          visibility: (data.visibility as Visibility) ?? 'private',
          shareId: (data.shareId as string | null) ?? null,
          updatedAt: millis(data.updatedAt, Date.now()),
          thumbnailPath: (data.thumbnailPath as string | null) ?? null,
        }
      })
    } catch (error) {
      throw toCloudError(error)
    }
  }

  async get(themeId: string): Promise<CloudTheme | null> {
    requireUid(this.deps.auth)
    try {
      const snap = await getDoc(doc(this.deps.db, 'themes', themeId))
      return snap.exists() ? readTheme(snap.id, snap.data()) : null
    } catch (error) {
      const e = toCloudError(error)
      // Rules deny reads of documents that do not exist *or* belong to someone else.
      if (e.kind === 'permission') return null
      throw e
    }
  }

  async save(input: {
    project: ThemeProject
    assets: ReadonlyMap<AssetId, CloudAssetSource>
    thumbnail: Blob | null
  }): Promise<CloudSaveResult> {
    const { db, storage, auth } = this.deps
    const uid = requireUid(auth)
    const project = structuredClone(input.project)
    if (project.cloudOwnerId && project.cloudOwnerId !== uid) {
      throw new CloudError('other-account', 'Project is linked to another account')
    }
    const linked = project.cloudThemeId !== null
    const themeRef = linked ? doc(db, 'themes', project.cloudThemeId!) : doc(collection(db, 'themes'))
    const revisionId = createRevisionId()

    try {
      // Fail fast before uploading anything when the base is already stale.
      let knownHashes = new Set<string>()
      if (linked) {
        const current = await this.get(themeRef.id)
        if (!current) throw new CloudError('gone', 'Cloud theme no longer exists')
        if (current.activeRevisionId !== project.cloudRevisionId) throw new CloudError('conflict', 'Base revision is stale')
        knownHashes = new Set(Object.values(current.assetManifest).map((a) => a.hash))
        if (current.previousRevisionId) {
          const prev = await getDoc(doc(themeRef, 'revisions', current.previousRevisionId)).catch(() => null)
          const prevManifest = (prev?.exists() ? prev.data().assetManifest : null) as AssetManifest | null
          Object.values(prevManifest ?? {}).forEach((a) => knownHashes.add(a.hash))
        }
      }

      const manifest: AssetManifest = {}
      const pending = new Map<string, { path: string; source: CloudAssetSource }>()
      for (const id of collectAssetIds(project.config)) {
        const source = input.assets.get(id)
        if (!source) throw new CloudError('missing-asset', `Asset ${id} missing`)
        const ext = EXT_BY_MIME[source.mime]
        const path = userAssetPath(uid, themeRef.id, source.hash, ext)
        const entry: CloudAssetEntry = {
          hash: source.hash,
          ext,
          mime: source.mime,
          width: source.width,
          height: source.height,
          size: source.size,
          name: source.name.slice(0, 120),
          path,
        }
        manifest[id] = entry
        if (!knownHashes.has(source.hash)) pending.set(path, { path, source })
      }
      for (const { path, source } of pending.values()) {
        await uploadBytes(ref(storage, path), source.blob, { contentType: source.mime, customMetadata: { sha256: source.hash } })
      }
      let thumbnailPath: string | null = null
      if (input.thumbnail) {
        thumbnailPath = userThumbnailPath(uid, themeRef.id, revisionId)
        await uploadBytes(ref(storage, thumbnailPath), input.thumbnail, { contentType: 'image/png' })
      }

      const result = await runTransaction(db, async (tx) => {
        // A new theme has a fresh random id; rules deny reading documents one does not own
        // (including non-existent ones), so only linked themes are read and verified here.
        let prev: Record<string, unknown> | null = null
        if (linked) {
          const cur = await tx.get(themeRef)
          if (!cur.exists()) throw new CloudError('gone', 'Cloud theme no longer exists')
          if (cur.data().activeRevisionId !== project.cloudRevisionId) throw new CloudError('conflict', 'Base revision is stale')
          prev = cur.data()
        }
        const visibility = (prev?.visibility as Visibility | undefined) ?? 'private'
        const shareId = (prev?.shareId as string | null | undefined) ?? null
        tx.set(doc(themeRef, 'revisions', revisionId), {
          ownerId: uid,
          name: project.name,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          config: project.config,
          assetManifest: manifest,
          thumbnailPath,
          baseRevisionId: project.cloudRevisionId,
          createdAt: serverTimestamp(),
        })
        tx.set(themeRef, {
          ownerId: uid,
          name: project.name,
          visibility,
          shareId,
          activeRevisionId: revisionId,
          previousRevisionId: (prev?.activeRevisionId as string | undefined) ?? null,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          config: project.config,
          assetManifest: manifest,
          exportThemeId: project.exportThemeId,
          thumbnailPath,
          createdAt: prev?.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        return { themeId: themeRef.id, revisionId, ownerId: uid, visibility, shareId }
      })

      // The user profile document is written only here, on an explicit save.
      await setDoc(
        doc(db, 'users', uid),
        { displayName: (auth.currentUser?.displayName ?? '').slice(0, 40), updatedAt: serverTimestamp() },
        { merge: true },
      ).catch(() => undefined)
      await this.cleanup(themeRef.id).catch(() => undefined)
      return result
    } catch (error) {
      // Files uploaded by a failed attempt are not deleted here: a content-addressed path can
      // also belong to the previous revision or to a concurrent save. They become orphans that
      // the next successful save's cleanup() removes after ORPHAN_GRACE_MS.
      throw toCloudError(error)
    }
  }

  /**
   * Deletes files and revision documents that are referenced by neither the active nor the
   * previous revision. Files younger than ORPHAN_GRACE_MS are kept (possible in-flight save).
   */
  async cleanup(themeId: string, now = Date.now()): Promise<{ deletedFiles: number; deletedRevisions: number }> {
    const { db, storage, auth } = this.deps
    const uid = requireUid(auth)
    const theme = await this.get(themeId)
    if (!theme) return { deletedFiles: 0, deletedRevisions: 0 }
    const keepRevisions = new Set([theme.activeRevisionId, theme.previousRevisionId].filter(Boolean) as string[])
    const keepPaths = new Set<string>(Object.values(theme.assetManifest).map((a) => a.path))
    if (theme.thumbnailPath) keepPaths.add(theme.thumbnailPath)
    if (theme.previousRevisionId) {
      const prev = await getDoc(doc(db, 'themes', themeId, 'revisions', theme.previousRevisionId)).catch(() => null)
      const data = prev?.exists() ? prev.data() : null
      if (data) {
        Object.values((data.assetManifest as AssetManifest) ?? {}).forEach((a) => keepPaths.add(a.path))
        if (data.thumbnailPath) keepPaths.add(String(data.thumbnailPath))
      }
    }

    let deletedFiles = 0
    for (const folder of ['assets', 'thumbnails']) {
      const listing = await listAll(ref(storage, `users/${uid}/themes/${themeId}/${folder}`))
      for (const item of listing.items) {
        if (keepPaths.has(item.fullPath)) continue
        const meta = await getMetadata(item)
        if (now - Date.parse(meta.updated) < ORPHAN_GRACE_MS) continue
        await deleteObject(item)
        deletedFiles++
      }
    }

    let deletedRevisions = 0
    const revs = await getDocs(query(collection(db, 'themes', themeId, 'revisions'), where('ownerId', '==', uid)))
    for (const r of revs.docs) {
      if (keepRevisions.has(r.id)) continue
      await deleteDoc(r.ref)
      deletedRevisions++
    }
    return { deletedFiles, deletedRevisions }
  }

  /**
   * Revokes access first (share document, then theme document). Storage files and revision
   * documents are removed by the `onThemeDeleted` / `onShareDeleted` functions with retries;
   * rules already deny them once the documents are gone.
   */
  async delete(themeId: string): Promise<void> {
    const { db } = this.deps
    requireUid(this.deps.auth)
    try {
      const theme = await this.get(themeId)
      if (!theme) return
      if (theme.shareId) await deleteDoc(doc(db, 'shares', theme.shareId))
      await deleteDoc(doc(db, 'themes', themeId))
    } catch (error) {
      throw toCloudError(error)
    }
  }

  /** Downloads the originals of a theme (owner only). */
  async downloadAssets(theme: Pick<CloudTheme, 'assetManifest'>): Promise<Map<AssetId, Blob>> {
    return downloadManifest(this.deps.storage, theme.assetManifest)
  }

  downloadBlob(path: string, type = 'image/png'): Promise<Blob> {
    return fetchBlob(this.deps.storage, path, type)
  }
}

/** Reads one file through Storage rules (no download-token URLs). getBytes works in browsers and Node. */
export async function fetchBlob(storage: FirebaseStorage, path: string, type: string): Promise<Blob> {
  try {
    return new Blob([await getBytes(ref(storage, path))], { type })
  } catch (error) {
    throw toCloudError(error)
  }
}

/** Downloads every file in a manifest, de-duplicated by path. */
export async function downloadManifest(storage: FirebaseStorage, manifest: AssetManifest, only?: ReadonlySet<AssetId>): Promise<Map<AssetId, Blob>> {
  const byPath = new Map<string, Promise<Blob>>()
  const out = new Map<AssetId, Blob>()
  try {
    await Promise.all(
      Object.entries(manifest)
        .filter(([id]) => !only || only.has(id))
        .map(async ([id, entry]) => {
          if (!byPath.has(entry.path)) byPath.set(entry.path, fetchBlob(storage, entry.path, entry.mime))
          out.set(id, await byPath.get(entry.path)!)
        }),
    )
  } catch (error) {
    throw toCloudError(error)
  }
  return out
}
