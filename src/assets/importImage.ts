import { createAssetId } from '@/domain/theme/ids'
import type { LocalProjectId } from '@/domain/theme/types'
import type { AssetRepository } from '@/repositories/types'
import { sha256Hex } from './hash'
import type { AssetMeta } from './types'
import { browserDecoder, validateImageFile, type ImageDecoder } from './validation'

/**
 * Validates a user-selected file and stores it as a local asset of `projectId`.
 * Purely local: never performs network writes.
 * Throws ImageValidationError (user-facing message) or StorageError.
 */
export async function importImage(
  projectId: LocalProjectId,
  file: File | Blob,
  assets: AssetRepository,
  decode: ImageDecoder = browserDecoder,
): Promise<AssetMeta> {
  const info = await validateImageFile(file, decode)
  const hash = await sha256Hex(file)
  const now = Date.now()
  // Re-wrap with the sniffed MIME so the stored Blob type is trustworthy.
  const blob = file.type === info.mime ? file : new Blob([file], { type: info.mime })
  return assets.attach(projectId, hash, () => ({
    id: createAssetId(),
    projectId,
    blob,
    mime: info.mime,
    width: info.width,
    height: info.height,
    size: file.size,
    hash,
    name: 'name' in file && typeof file.name === 'string' ? file.name.slice(0, 120) : 'image',
    createdAt: now,
    lastAttachedAt: now,
  }))
}
