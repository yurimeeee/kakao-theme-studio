import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react'
import { useEditor } from '@/features/editor/store'
import type { AssetId } from '@/domain/theme/types'
import { ObjectUrlCache, objectUrls } from './objectUrls'

interface AssetSource {
  blobs: ReadonlyMap<AssetId, Blob>
  urls: ObjectUrlCache
}

const AssetSourceContext = createContext<AssetSource | null>(null)

/**
 * Supplies images for a preview that is not the open editor project (e.g. a shared theme).
 * URLs come from a cache owned by this provider and are revoked when it unmounts.
 */
export function AssetProvider({ blobs, children }: { blobs: ReadonlyMap<AssetId, Blob>; children: ReactNode }) {
  const [urls] = useState(() => new ObjectUrlCache())
  useEffect(() => () => urls.clear(), [urls])
  return createElement(AssetSourceContext.Provider, { value: { blobs, urls } }, children)
}

/** Display URL for an asset of the open project (or the nearest AssetProvider); released on unmount/change. */
export function useAssetUrl(id: AssetId | null | undefined): string | null {
  const source = useContext(AssetSourceContext)
  const editorRecord = useEditor((s) => (id && !source ? s.assets.get(id) : undefined))
  const blob = source ? (id ? source.blobs.get(id) : undefined) : editorRecord?.blob
  const cache = source?.urls ?? objectUrls
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    // Object URLs are an external resource: acquire/release must live in an effect.
    if (!id || !blob) {
      // eslint-disable-next-line react/set-state-in-effect
      setUrl(null)
      return
    }
    // eslint-disable-next-line react/set-state-in-effect
    setUrl(cache.acquire(id, blob))
    return () => cache.release(id)
  }, [id, blob, cache])
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
