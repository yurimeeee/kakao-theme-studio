import { getRepositories } from '@/app/services'
import type { AssetRecord } from '@/assets/types'
import { createNewProject, DEFAULT_THEME_NAME } from '@/domain/theme/defaults'
import type { AssetId, LocalProjectId } from '@/domain/theme/types'
import { mapThemeArchive } from '@/importers/ktheme/mapTheme'
import { browserInspector, type ImageInspector } from '@/importers/ktheme/probe'
import { readKthemeArchive } from '@/importers/ktheme/readArchive'
import { normalizeThemeName } from '../editor/store'
import { renderThumbnail, type ThumbnailSource } from './thumbnail'

export interface KthemeImportResult {
  projectId: LocalProjectId
  name: string
  notes: string[]
}

/**
 * 가져오기: a .ktheme becomes a new local project with its own images and a new .ktheme id,
 * so exporting it never replaces the original theme on the phone. Purely local.
 */
export async function importKthemeFile(file: Blob, inspect: ImageInspector = browserInspector): Promise<KthemeImportResult> {
  const imported = await mapThemeArchive(await readKthemeArchive(file), inspect)
  const now = Date.now()
  const project = createNewProject(now)
  const name = normalizeThemeName(imported.name) || DEFAULT_THEME_NAME
  const records: AssetRecord[] = [...imported.images].map(([id, img]) => ({ ...img, id, projectId: project.id, size: img.blob.size, createdAt: now, lastAttachedAt: now }))

  let thumbnail: Blob | null = null
  try {
    thumbnail = await renderThumbnail(imported.config, new Map<AssetId, ThumbnailSource>([...imported.images].map(([id, img]) => [id, img])))
  } catch {
    // The editor draws it on first open.
  }
  await getRepositories().projects.replaceFromCloud({ ...project, name, config: imported.config }, records, thumbnail)
  return { projectId: project.id, name, notes: imported.notes }
}
