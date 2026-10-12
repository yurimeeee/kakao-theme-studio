import { useEffect, useState } from 'react'
import { useBlobUrl } from '@/assets/useAssetUrl'

/** List thumbnail fetched through Storage rules. Shows a neutral placeholder until (or unless) it loads. */
export function CloudThumb({ path, load }: { path: string | null; load: (path: string) => Promise<Blob> }) {
  const [blob, setBlob] = useState<Blob | null>(null)
  useEffect(() => {
    if (!path) return
    let cancelled = false
    load(path)
      .then((b) => !cancelled && setBlob(b))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [path, load])
  const url = useBlobUrl(path ? blob : null)
  return <ThumbFrame url={url} />
}

export function ThumbFrame({ url }: { url: string | null }) {
  return (
    <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-surface" aria-hidden>
      {url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <span className="flex flex-col gap-1.5">
          <span className="h-2.5 w-7 rounded-full bg-hair" />
          <span className="ml-3 h-2.5 w-7 rounded-full bg-faint/50" />
        </span>
      )}
    </span>
  )
}
