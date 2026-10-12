import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useEditor } from '@/features/editor/store'
import type { AssetId } from '@/domain/theme/types'
import { ObjectUrlCache, objectUrls } from './objectUrls'

/** An image plus the pixel size the preview needs (e.g. for image bubbles). */
export interface PreviewAsset {
  blob: Blob
  width: number
  height: number
}

interface AssetSource {
  assets: ReadonlyMap<AssetId, PreviewAsset>
  urls: ObjectUrlCache
}

const AssetSourceContext = createContext<AssetSource | null>(null)

/**
 * Supplies images for a preview that is not the open editor project (e.g. a shared theme).
 * URLs come from a cache owned by this provider and are revoked when it unmounts.
 */
export function AssetProvider({ assets, children }: { assets: ReadonlyMap<AssetId, PreviewAsset>; children: ReactNode }) {
  const [urls] = useState(() => new ObjectUrlCache())
  useEffect(() => () => urls.clear(), [urls])
  const value = useMemo(() => ({ assets, urls }), [assets, urls])
  return createElement(AssetSourceContext.Provider, { value }, children)
}

/** Image of the open project, or of the nearest AssetProvider when there is one. */
function usePreviewAsset(id: AssetId | null | undefined): { source: AssetSource | null; asset: PreviewAsset | undefined } {
  const source = useContext(AssetSourceContext)
  const editorRecord = useEditor((s) => (id && !source ? s.assets.get(id) : undefined))
  return { source, asset: source ? (id ? source.assets.get(id) : undefined) : editorRecord }
}

/** Pixel size of an asset (open project or nearest AssetProvider); null when unknown. */
export function useAssetSize(id: AssetId | null | undefined): { width: number; height: number } | null {
  const { asset } = usePreviewAsset(id)
  return asset ? { width: asset.width, height: asset.height } : null
}

/** Display URL for an asset of the open project (or the nearest AssetProvider); released on unmount/change. */
export function useAssetUrl(id: AssetId | null | undefined): string | null {
  const { source, asset } = usePreviewAsset(id)
  const blob = asset?.blob
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
