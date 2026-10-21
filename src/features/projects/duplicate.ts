import { getRepositories } from '@/app/services'
import type { AssetRecord } from '@/assets/types'
import { createNewProject, THEME_NAME_MAX_LENGTH } from '@/domain/theme/defaults'
import { createAssetId } from '@/domain/theme/ids'
import { collectAssetIds, mapAssetRefs } from '@/domain/theme/normalize'
import { applyScheme, invertPalette, paletteTone, type SchemeTone } from '@/domain/theme/scheme'
import type { AssetId, LocalProjectId, ThemeConfig, ThemeProject } from '@/domain/theme/types'
import { StorageError } from '@/repositories/types'
import { flushAutosave } from '../editor/autosave'
import { renderThumbnail } from './thumbnail'

const SUFFIX = ' 사본'

/** "이름 사본", shortened so the whole name fits the limit. */
export function copyName(name: string): string {
  return `${name.slice(0, THEME_NAME_MAX_LENGTH - SUFFIX.length).trimEnd()}${SUFFIX}`
}

/**
 * 사본 만들기: a new local project with the same settings and its own copies of the images.
 * The copy is not linked to the cloud and gets its own .ktheme id, so it installs as a
 * separate theme. A 복제 credit (`origin`) is kept.
 */
export function duplicateProject(id: LocalProjectId, thumbnail: Blob | null): Promise<LocalProjectId> {
  return copyProject(id, (source) => ({ name: copyName(source.name), config: source.config, thumbnail }))
}

const TONE_SUFFIX: Record<SchemeTone, string> = { dark: ' 다크', light: ' 라이트' }

/** "이름 다크", shortened so the whole name fits the limit. */
export function pairName(name: string, tone: SchemeTone): string {
  const suffix = TONE_SUFFIX[tone]
  return `${name.slice(0, THEME_NAME_MAX_LENGTH - suffix.length).trimEnd()}${suffix}`
}

/** The tone a 다크/라이트 사본 of `config` would be in. */
export const pairTone = (config: ThemeConfig): SchemeTone => (paletteTone(config.palette) === 'light' ? 'dark' : 'light')

/**
 * 다크/라이트 사본: a copy in the opposite tone. Colors follow the inverted 전체 색상 (element
 * color overrides return to 기본, as with 색 하나로 만들기); uploaded images are kept as they are.
 */
export function createTonePair(id: LocalProjectId): Promise<{ id: LocalProjectId; tone: SchemeTone }> {
  let tone: SchemeTone = 'dark'
  return copyProject(id, async (source, images) => {
    tone = pairTone(source.config)
    const config = structuredClone(source.config)
    applyScheme(config, invertPalette(config.palette))
    let thumbnail: Blob | null = null
    try {
      thumbnail = await renderThumbnail(config, images)
    } catch {
      // The editor draws it on first open.
    }
    return { name: pairName(source.name, tone), config, thumbnail }
  }).then((copyId) => ({ id: copyId, tone }))
}

async function copyProject(
  id: LocalProjectId,
  make: (source: ThemeProject, images: ReadonlyMap<AssetId, AssetRecord>) => Promise<{ name: string; config: ThemeConfig; thumbnail: Blob | null }> | { name: string; config: ThemeConfig; thumbnail: Blob | null },
): Promise<LocalProjectId> {
  // The open project may have edits that are not written yet.
  await flushAutosave()
  const { projects, assets } = getRepositories()
  const source = await projects.get(id)
  if (!source) throw new StorageError('corrupt', `Project ${id} not found`)
  const originals = await assets.getMany(collectAssetIds(source.config))
  const { name, config, thumbnail } = await make(source, originals)

  const now = Date.now()
  const copy = createNewProject(now)
  const idMap = new Map<AssetId, AssetId>()
  const records: AssetRecord[] = []
  for (const [oldId, record] of originals) {
    const newId = createAssetId()
    idMap.set(oldId, newId)
    records.push({ ...record, id: newId, projectId: copy.id, createdAt: now, lastAttachedAt: now })
  }
  await projects.replaceFromCloud({ ...copy, name, config: mapAssetRefs(config, (a) => idMap.get(a) ?? null), origin: source.origin }, records, thumbnail)
  return copy.id
}
