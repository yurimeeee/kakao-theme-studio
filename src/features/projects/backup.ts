import JSZip from 'jszip'
import { getRepositories } from '@/app/services'
import { sha256Hex } from '@/assets/hash'
import type { AssetRecord } from '@/assets/types'
import { browserDecoder, IMAGE_LIMITS, validateImageFile, type ImageDecoder } from '@/assets/validation'
import { createNewProject, DEFAULT_THEME_NAME } from '@/domain/theme/defaults'
import { createAssetId, createExportThemeId, isAssetId } from '@/domain/theme/ids'
import { collectAssetIds, mapAssetRefs, migrateConfig, normalizeOrigin, UnsupportedSchemaError } from '@/domain/theme/normalize'
import type { AssetId, LocalProjectId, ThemeProject } from '@/domain/theme/types'
import { declaredSize, zipEntries } from '@/importers/ktheme/readArchive'
import { toSafeFileName } from '@/lib/download'
import { StorageError } from '@/repositories/types'
import { flushAutosave } from '../editor/autosave'
import { normalizeThemeName } from '../editor/store'
import { renderThumbnail, type ThumbnailSource } from './thumbnail'

/**
 * 백업 파일: a ZIP holding the project as the editor keeps it (config with crop/zoom, every
 * original image, inactive ones included), so it restores exactly. Unlike a .ktheme it is not
 * installable; it exists so work kept only in this browser can survive clearing site data.
 *
 *   project.json      — BackupManifest
 *   images/<id>.<ext> — original uploads
 */
export const BACKUP_EXTENSION = '.ktproject'
export const BACKUP_LIMITS = {
  /** Up to ~30 originals of 10MB each fit; larger files are not something this app writes. */
  maxArchiveBytes: 300 * 1024 * 1024,
}

const MANIFEST_FILE = 'project.json'
const FORMAT = 'kakao-theme-studio/project'
const FORMAT_VERSION = 1
const EXTENSION: Record<AssetRecord['mime'], string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

interface BackupManifest {
  format: typeof FORMAT
  formatVersion: number
  savedAt: number
  project: Pick<ThemeProject, 'name' | 'exportThemeId' | 'createdAt' | 'updatedAt' | 'origin' | 'config'>
  assets: { id: AssetId; path: string; name: string }[]
}

export type BackupErrorCode = 'newer-version' | 'corrupt'

export class BackupError extends Error {
  readonly code: BackupErrorCode

  constructor(code: BackupErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'BackupError'
  }
}

export function backupErrorMessage(e: BackupError): string {
  return e.code === 'newer-version' ? '더 새로운 버전에서 만든 백업 파일이에요. 페이지를 새로고침한 뒤 다시 시도해 주세요.' : '백업 파일이 손상돼 읽지 못했어요.'
}

/** Writes the stored project (pending autosave first) and its images into a backup file. */
export async function createProjectBackup(id: LocalProjectId): Promise<{ blob: Blob; fileName: string }> {
  await flushAutosave()
  const { projects, assets } = getRepositories()
  const project = await projects.get(id)
  if (!project) throw new StorageError('corrupt', `Project ${id} not found`)
  const records = await assets.getMany(collectAssetIds(project.config))

  const zip = new JSZip()
  const manifest: BackupManifest = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    savedAt: Date.now(),
    project: {
      name: project.name,
      exportThemeId: project.exportThemeId,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      origin: project.origin,
      config: project.config,
    },
    assets: [],
  }
  for (const [assetId, record] of records) {
    const path = `images/${assetId}.${EXTENSION[record.mime]}`
    manifest.assets.push({ id: assetId, path, name: record.name })
    // Images are already compressed; storing them keeps saving fast.
    zip.file(path, new Uint8Array(await record.blob.arrayBuffer()), { binary: true, compression: 'STORE' })
  }
  zip.file(MANIFEST_FILE, JSON.stringify(manifest, null, 2), { compression: 'DEFLATE' })
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  return { blob: new Blob([bytes as BlobPart], { type: 'application/zip' }), fileName: toSafeFileName(project.name, BACKUP_EXTENSION, DEFAULT_THEME_NAME) }
}

export function isProjectBackup(zip: JSZip): boolean {
  return zip.file(MANIFEST_FILE) !== null
}

export interface BackupRestoreResult {
  projectId: LocalProjectId
  name: string
  notes: string[]
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const EXPORT_THEME_ID = /^[A-Za-z0-9_]{1,64}$/

/**
 * Restores a backup as a new local project with fresh image ids (never touching existing
 * projects). It keeps the .ktheme id, so re-exporting updates the theme already on the phone,
 * unless a project in this browser still uses that id; then it gets a new one, like a copy.
 */
export async function restoreProjectBackup(zip: JSZip, decode: ImageDecoder = browserDecoder): Promise<BackupRestoreResult> {
  let raw: Record<string, unknown>
  try {
    raw = obj(JSON.parse(await zip.file(MANIFEST_FILE)!.async('string')))
  } catch {
    throw new BackupError('corrupt', 'Unreadable manifest')
  }
  if (raw.format !== FORMAT) throw new BackupError('corrupt', 'Not a project backup')
  if (typeof raw.formatVersion !== 'number' || raw.formatVersion > FORMAT_VERSION) throw new BackupError('newer-version', `Backup format ${String(raw.formatVersion)}`)
  const source = obj(raw.project)
  let config
  try {
    config = migrateConfig(source.config)
  } catch (e) {
    if (e instanceof UnsupportedSchemaError) throw new BackupError('newer-version', e.message)
    throw new BackupError('corrupt', 'Invalid config')
  }

  const files = new Map(zipEntries(zip).map((e) => [e.name, e]))
  const referenced = collectAssetIds(config)
  const now = Date.now()
  const project = createNewProject(now)
  const idMap = new Map<AssetId, AssetId>()
  const records: AssetRecord[] = []
  for (const item of Array.isArray(raw.assets) ? raw.assets : []) {
    const { id, path, name } = obj(item)
    if (!isAssetId(id) || !referenced.has(id) || idMap.has(id) || typeof path !== 'string') continue
    const entry = files.get(path)
    if (!entry || declaredSize(entry) > IMAGE_LIMITS.maxBytes) continue
    const blob = new Blob([(await entry.async('uint8array')) as BlobPart])
    try {
      const image = await validateImageFile(blob, decode)
      const typed = new Blob([blob], { type: image.mime })
      const newId = createAssetId()
      idMap.set(id, newId)
      records.push({
        id: newId,
        projectId: project.id,
        blob: typed,
        ...image,
        size: typed.size,
        hash: await sha256Hex(typed),
        name: typeof name === 'string' ? name.slice(0, 200) : '',
        createdAt: now,
        lastAttachedAt: now,
      })
    } catch {
      // Left empty below and reported.
    }
  }
  const notes: string[] = []
  const lost = [...referenced].filter((id) => !idMap.has(id)).length
  if (lost) notes.push(`이미지 ${lost}개를 읽지 못해 비워 뒀어요. 해당 요소에서 이미지를 다시 선택해 주세요.`)
  config = mapAssetRefs(config, (id) => idMap.get(id) ?? null)

  let exportThemeId = typeof source.exportThemeId === 'string' && EXPORT_THEME_ID.test(source.exportThemeId) ? source.exportThemeId : createExportThemeId()
  if (await usedLocally(exportThemeId)) {
    exportThemeId = createExportThemeId()
    notes.push('이 브라우저에 같은 테마가 있어 사본으로 불러왔어요. 내보내면 휴대폰에 별도 테마로 설치돼요.')
  }
  const name = normalizeThemeName(typeof source.name === 'string' ? source.name : '') || DEFAULT_THEME_NAME
  const createdAt = typeof source.createdAt === 'number' && Number.isFinite(source.createdAt) && source.createdAt <= now ? source.createdAt : now

  let thumbnail: Blob | null = null
  try {
    thumbnail = await renderThumbnail(config, new Map<AssetId, ThumbnailSource>(records.map((r) => [r.id, r])))
  } catch {
    // The editor draws it on first open.
  }
  await getRepositories().projects.replaceFromCloud({ ...project, name, exportThemeId, createdAt, config, origin: normalizeOrigin(source.origin) }, records, thumbnail)
  return { projectId: project.id, name, notes }
}

async function usedLocally(exportThemeId: string): Promise<boolean> {
  const { projects } = getRepositories()
  for (const summary of await projects.list()) {
    if ((await projects.get(summary.id))?.exportThemeId === exportThemeId) return true
  }
  return false
}
