import type { AssetRecord } from '@/assets/types'
import { activeAssetIds, resolveTheme } from '@/domain/theme/resolve'
import type { AssetId, ThemeProject } from '@/domain/theme/types'
import { ExportError, type ExportSnapshot } from '@/exporters/ktheme/buildPackage'
import type { AssetRepository } from '@/repositories/types'

/**
 * Takes an immutable snapshot of `project` (deep copy + only the assets it uses),
 * builds the .ktheme in the browser and starts the download. No network writes.
 */
export async function exportProject(
  project: ThemeProject,
  loaded: ReadonlyMap<AssetId, AssetRecord> | null,
  assetRepo: AssetRepository,
): Promise<string> {
  const config = structuredClone(project.config)
  const needed = activeAssetIds(resolveTheme(config))
  const assets = new Map<AssetId, Blob>()
  const missing: AssetId[] = []
  const fromRepo = await assetRepo.getMany([...needed].filter((id) => !loaded?.has(id)))
  for (const id of needed) {
    const record = loaded?.get(id) ?? fromRepo.get(id)
    if (record) assets.set(id, record.blob)
    else missing.push(id)
  }
  if (missing.length) throw new ExportError('missing-asset', 'Assets missing', missing)

  const snapshot: ExportSnapshot = {
    name: project.name,
    exportThemeId: project.exportThemeId,
    revision: project.revision,
    config,
    assets,
  }
  // Loaded on demand: keeps JSZip and the canvas pipeline out of the initial bundle.
  const { createKthemeArchive, downloadBlob } = await import('@/exporters/ktheme/exportTheme')
  const archive = await createKthemeArchive(snapshot)
  downloadBlob(archive.blob, archive.fileName)
  return archive.fileName
}

export function exportErrorMessage(error: unknown): string {
  if (error instanceof ExportError) {
    if (error.code === 'missing-asset') return '테마에 사용한 이미지를 찾을 수 없어요. 이미지를 다시 선택해 주세요.'
    if (error.code === 'decode-failed') return '이미지를 불러오지 못했어요. 다른 이미지로 바꿔 주세요.'
    if (error.code === 'invalid-package') return '테마 파일 검증에 실패했어요. 설정을 확인한 뒤 다시 시도해 주세요.'
  }
  return '테마 파일을 만들지 못했어요. 다시 시도해 주세요.'
}
