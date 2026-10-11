import type { AssetId } from '@/domain/theme/types'

/**
 * Reference-counted object URLs for asset Blobs. Object URLs are display-only and
 * never persisted. When the last user releases a URL it is revoked.
 */
export class ObjectUrlCache {
  private entries = new Map<AssetId, { url: string; refs: number }>()

  private readonly create: (blob: Blob) => string
  private readonly revoke: (url: string) => void

  constructor(
    create: (blob: Blob) => string = (b) => URL.createObjectURL(b),
    revoke: (url: string) => void = (u) => URL.revokeObjectURL(u),
  ) {
    this.create = create
    this.revoke = revoke
  }

  acquire(id: AssetId, blob: Blob): string {
    const entry = this.entries.get(id)
    if (entry) {
      entry.refs += 1
      return entry.url
    }
    const url = this.create(blob)
    this.entries.set(id, { url, refs: 1 })
    return url
  }

  release(id: AssetId): void {
    const entry = this.entries.get(id)
    if (!entry) return
    entry.refs -= 1
    if (entry.refs <= 0) {
      this.revoke(entry.url)
      this.entries.delete(id)
    }
  }

  /** Revoke everything (e.g. when switching projects). */
  clear(): void {
    for (const { url } of this.entries.values()) this.revoke(url)
    this.entries.clear()
  }

  get size(): number {
    return this.entries.size
  }
}

export const objectUrls = new ObjectUrlCache()
