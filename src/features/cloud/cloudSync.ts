import { getRepositories } from '@/app/services'
import type { AssetRecord } from '@/assets/types'
import { CloudError } from '@/cloud/errors'
import type { Visibility } from '@/cloud/model'
import { createAssetId, createExportThemeId, createLocalProjectId } from '@/domain/theme/ids'
import { collectAssetIds, mapAssetRefs } from '@/domain/theme/normalize'
import type { AssetId, ThemeProject } from '@/domain/theme/types'
import type { SharedTheme } from '@/repositories/cloud/shares'
import { flushAutosave } from '../editor/autosave'
import { useEditor } from '../editor/store'
import { exportConfig } from '../export/exportProject'
import { renderThumbnail } from '../projects/thumbnail'
import { currentUid, loadCloud } from '../auth/session'

/**
 * Bridges the local editor and the cloud. Every function here runs only from an explicit
 * user confirmation (저장 / 내보내기 / 공유 설정 확인 / 내 테마 actions) — never from autosave.
 */

export interface CloudSaveOutcome {
  themeId: string
  visibility: Visibility
  shareId: string | null
  /** Saved, but the published copy could not be updated. */
  publishWarning: string | null
}

async function openProjectAssets(project: ThemeProject): Promise<Map<AssetId, AssetRecord>> {
  const loaded = useEditor.getState().assets
  const ids = collectAssetIds(project.config)
  const missing = [...ids].filter((id) => !loaded.has(id))
  const fromRepo = missing.length ? await getRepositories().assets.getMany(missing) : new Map<AssetId, AssetRecord>()
  const out = new Map<AssetId, AssetRecord>()
  for (const id of ids) {
    const r = loaded.get(id) ?? fromRepo.get(id)
    if (r) out.set(id, r)
  }
  return out
}

/**
 * Uploads the open project (already written locally) as a new cloud revision, records the
 * cloud link locally, then applies `visibility` (or refreshes the published copy).
 */
export async function saveOpenProjectToCloud(options: { visibility?: Visibility; asNewTheme?: boolean } = {}): Promise<CloudSaveOutcome> {
  const rt = await loadCloud()
  const state = useEditor.getState()
  if (state.phase !== 'ready' || !state.project) throw new CloudError('unknown', 'No project open')
  let project = structuredClone(state.project)
  if (options.asNewTheme) {
    // 새 테마로 저장: a separate cloud theme with its own .ktheme id.
    project = { ...project, cloudThemeId: null, cloudOwnerId: null, cloudRevisionId: null, exportThemeId: createExportThemeId() }
  }
  const assets = await openProjectAssets(project)
  const thumbnail = await renderThumbnail(project.config, assets).catch(() => null)
  const result = await rt.themes.save({ project, assets, thumbnail })

  // Record the link locally (explicit write, so the next save uses the right base).
  const current = useEditor.getState()
  if (current.project?.id === project.id) {
    useEditor.setState({
      project: {
        ...current.project,
        exportThemeId: project.exportThemeId,
        cloudThemeId: result.themeId,
        cloudOwnerId: result.ownerId,
        cloudRevisionId: result.revisionId,
      },
    })
    if (!(await flushAutosave({ explicit: true }))) await flushAutosave({ explicit: true })
  }

  const localBlobs = new Map([...assets.values()].map((a) => [a.hash, a.blob]))
  const localThumbnail = thumbnail ? { revisionId: result.revisionId, blob: thumbnail } : null
  let visibility = result.visibility
  let shareId = result.shareId
  let publishWarning: string | null = null
  try {
    if (options.visibility && options.visibility !== result.visibility) {
      shareId = (await rt.shares.setVisibility(result.themeId, options.visibility, { localBlobs, localThumbnail })).shareId
      visibility = options.visibility
    } else if (result.visibility !== 'private') {
      await rt.shares.syncPublished(result.themeId, { localBlobs, localThumbnail })
    }
  } catch {
    publishWarning =
      options.visibility && options.visibility !== result.visibility
        ? '클라우드에 저장했지만 공개 범위를 바꾸지 못했어요. 공유 설정에서 다시 시도해 주세요.'
        : '클라우드에 저장했지만 공개된 테마를 갱신하지 못했어요. 공유 설정에서 다시 시도해 주세요.'
  }
  return { themeId: result.themeId, visibility, shareId, publishWarning }
}

export type OpenCloudResult = { kind: 'opened'; localId: string } | { kind: 'diverged'; localId: string }

/**
 * Opens a cloud theme for editing in this browser. Downloads it into a local project
 * (asset ids are re-issued locally) unless an up-to-date local copy already exists.
 * When a local copy is based on an older revision, returns 'diverged' unless `replace`.
 */
export async function openCloudTheme(themeId: string, options: { replace?: boolean } = {}): Promise<OpenCloudResult> {
  const rt = await loadCloud()
  const uid = currentUid()
  if (!uid) throw new CloudError('unauthenticated', 'Not signed in')
  const theme = await rt.themes.get(themeId)
  if (!theme) throw new CloudError('not-found', 'Theme not found')

  const { projects } = getRepositories()
  const existing = await projects.findByCloudThemeId(themeId)
  if (existing && existing.cloudOwnerId === uid) {
    if (existing.cloudRevisionId === theme.activeRevisionId) return { kind: 'opened', localId: existing.id }
    if (!options.replace) return { kind: 'diverged', localId: existing.id }
  }

  const [blobs, thumbnail] = await Promise.all([
    rt.themes.downloadAssets(theme),
    theme.thumbnailPath ? rt.themes.downloadBlob(theme.thumbnailPath).catch(() => null) : Promise.resolve(null),
  ])
  const now = Date.now()
  const localId = existing?.id ?? createLocalProjectId()
  const idMap = new Map<AssetId, AssetId>()
  const records: AssetRecord[] = []
  for (const [cloudId, entry] of Object.entries(theme.assetManifest)) {
    const blob = blobs.get(cloudId)
    if (!blob) continue
    const id = createAssetId()
    idMap.set(cloudId, id)
    records.push({
      id,
      projectId: localId,
      blob,
      mime: entry.mime,
      width: entry.width,
      height: entry.height,
      size: entry.size,
      hash: entry.hash,
      name: entry.name,
      createdAt: now,
      lastAttachedAt: now,
    })
  }
  const project: ThemeProject = {
    id: localId,
    cloudThemeId: theme.id,
    cloudOwnerId: uid,
    cloudRevisionId: theme.activeRevisionId,
    exportThemeId: theme.exportThemeId,
    name: theme.name,
    config: mapAssetRefs(theme.config, (id) => idMap.get(id) ?? null),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    savedAt: now,
    revision: existing?.revision ?? 0,
  }
  // The open editor copy is being replaced on purpose: drop it without writing it back.
  if (useEditor.getState().project?.id === localId) useEditor.getState().close()
  await projects.replaceFromCloud(project, records, thumbnail)
  return { kind: 'opened', localId }
}

/** 내 테마 → 내보내기: builds the file from the cloud copy without creating a local project. */
export async function exportCloudTheme(themeId: string): Promise<string> {
  const rt = await loadCloud()
  const theme = await rt.themes.get(themeId)
  if (!theme) throw new CloudError('not-found', 'Theme not found')
  const blobs = await rt.themes.downloadAssets(theme)
  return exportConfig({ name: theme.name, exportThemeId: theme.exportThemeId, revision: 0, config: theme.config, blobs })
}

/** Shared theme download (anyone). Never creates a local or cloud project for the downloader. */
export async function exportSharedTheme(share: SharedTheme, blobs: ReadonlyMap<AssetId, Blob>): Promise<string> {
  const fileName = await exportConfig({ name: share.name, exportThemeId: share.exportThemeId, revision: 0, config: share.config, blobs })
  void loadCloud().then((rt) => rt.shares.recordDownload(share.id))
  return fileName
}

export const shareUrl = (shareId: string) => `${window.location.origin}${window.location.pathname}#/t/${shareId}`
