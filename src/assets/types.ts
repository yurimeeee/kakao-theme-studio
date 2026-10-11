import type { AssetId, LocalProjectId } from '@/domain/theme/types'

export type SupportedImageMime = 'image/png' | 'image/jpeg' | 'image/webp'

/** One locally stored image. Scoped to a single project (no cross-project sharing). */
export interface AssetRecord {
  id: AssetId
  projectId: LocalProjectId
  blob: Blob
  mime: SupportedImageMime
  width: number
  height: number
  size: number
  /** SHA-256 hex of the original bytes; used for dedupe now and in phase 2 uploads. */
  hash: string
  /** Original file name, for display only. */
  name: string
  createdAt: number
  /**
   * Last time this asset was attached to the config (new upload or dedupe reuse).
   * Garbage collection only removes assets attached before the saved snapshot.
   */
  lastAttachedAt: number
}

export type AssetMeta = Omit<AssetRecord, 'blob'>
