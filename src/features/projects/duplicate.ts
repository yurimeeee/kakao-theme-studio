import { getRepositories } from '@/app/services'
import type { AssetRecord } from '@/assets/types'
import { createNewProject, THEME_NAME_MAX_LENGTH } from '@/domain/theme/defaults'
import { createAssetId } from '@/domain/theme/ids'
import { collectAssetIds, mapAssetRefs } from '@/domain/theme/normalize'
import type { AssetId, LocalProjectId } from '@/domain/theme/types'
import { StorageError } from '@/repositories/types'
import { flushAutosave } from '../editor/autosave'

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
export async function duplicateProject(id: LocalProjectId, thumbnail: Blob | null): Promise<LocalProjectId> {
  // The open project may have edits that are not written yet.
  await flushAutosave()
  const { projects, assets } = getRepositories()
  const source = await projects.get(id)
  if (!source) throw new StorageError('corrupt', `Project ${id} not found`)
  const originals = await assets.getMany(collectAssetIds(source.config))

  const now = Date.now()
  const copy = createNewProject(now)
  const idMap = new Map<AssetId, AssetId>()
  const records: AssetRecord[] = []
  for (const [oldId, record] of originals) {
    const newId = createAssetId()
    idMap.set(oldId, newId)
    records.push({ ...record, id: newId, projectId: copy.id, createdAt: now, lastAttachedAt: now })
  }
  await projects.replaceFromCloud(
    { ...copy, name: copyName(source.name), config: mapAssetRefs(source.config, (a) => idMap.get(a) ?? null), origin: source.origin },
    records,
    thumbnail,
  )
  return copy.id
}
