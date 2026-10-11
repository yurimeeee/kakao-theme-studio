import { useEffect, useState } from 'react'
import { useEditor } from '@/features/editor/store'
import type { AssetId } from '@/domain/theme/types'
import { objectUrls } from './objectUrls'

/** Display URL for an asset of the open project; released (and revoked when unused) on unmount/change. */
export function useAssetUrl(id: AssetId | null | undefined): string | null {
  const record = useEditor((s) => (id ? s.assets.get(id) : undefined))
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    // Object URLs are an external resource: acquire/release must live in an effect.
    if (!id || !record) {
      // eslint-disable-next-line react/set-state-in-effect
      setUrl(null)
      return
    }
    // eslint-disable-next-line react/set-state-in-effect
    setUrl(objectUrls.acquire(id, record.blob))
    return () => objectUrls.release(id)
  }, [id, record])
  return url
}

/** Object URL for a standalone Blob (e.g. list thumbnails). */
export function useBlobUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) {
      // eslint-disable-next-line react/set-state-in-effect
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(blob)
    // eslint-disable-next-line react/set-state-in-effect
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}
