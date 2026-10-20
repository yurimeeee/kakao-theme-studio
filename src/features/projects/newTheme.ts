import { getRepositories } from '@/app/services'
import { createNewProject } from '@/domain/theme/defaults'
import { presetConfig, type ThemePreset } from '@/domain/theme/presets'
import type { LocalProjectId } from '@/domain/theme/types'
import { renderThumbnail } from './thumbnail'

/** A new local project in the preset's colors. */
export async function createProjectFromPreset(preset: ThemePreset): Promise<LocalProjectId> {
  const project = { ...createNewProject(), config: presetConfig(preset) }
  let thumbnail: Blob | null = null
  try {
    thumbnail = await renderThumbnail(project.config, new Map())
  } catch {
    // The editor draws it on first open.
  }
  await getRepositories().projects.replaceFromCloud(project, [], thumbnail)
  return project.id
}
