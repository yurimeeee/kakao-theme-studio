import { ImagePlus, Trash2 } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { ImageValidationError } from '@/assets/validation'
import { useAssetUrl } from '@/assets/useAssetUrl'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import type { AssetId } from '@/domain/theme/types'
import { storageErrorMessage, StorageError } from '@/repositories/types'
import { useEditor } from './store'

interface ImageFieldProps {
  label: string
  assetId: AssetId | null
  /** Called with the stored asset id after validation + local storage succeeded. */
  onChange: (assetId: AssetId | null) => void
  hint?: string
  compact?: boolean
}

const ACCEPT = 'image/png,image/jpeg,image/webp'

/**
 * Select / replace / remove one image. The file is validated (type, bytes, decode,
 * size) and stored locally before the config references it. Double selection is
 * blocked while busy.
 */
export function ImageField({ label, assetId, onChange, hint, compact }: ImageFieldProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const url = useAssetUrl(assetId)
  const record = useEditor((s) => (assetId ? s.assets.get(assetId) : undefined))
  const attachImage = useEditor((s) => s.attachImage)

  const pick = async (file: File | undefined) => {
    if (!file || busy) return
    setBusy(true)
    setError(null)
    try {
      onChange(await attachImage(file))
    } catch (e) {
      if (e instanceof ImageValidationError) setError(e.message)
      else if (e instanceof StorageError) setError(storageErrorMessage(e))
      else setError('이미지를 불러오지 못했어요.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={id} className="text-[13px] text-sub">
        {label}
      </span>
      <div className="flex items-center gap-3 rounded-[var(--radius-field)] bg-canvas p-2.5">
        <div
          className={`flex shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-surface ${compact ? 'size-11' : 'size-14'}`}
          aria-hidden
        >
          {url ? <img src={url} alt="" className="size-full object-cover" /> : <ImagePlus className="size-5 text-faint" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-ink">{record ? record.name : '선택한 이미지 없음'}</p>
          {record && (
            <p className="text-[12px] tabular-nums text-sub">
              {record.width}×{record.height}px
            </p>
          )}
        </div>
        <Button variant={assetId ? 'surface' : 'solid'} className="min-h-10 px-4 text-[13px]" busy={busy} onClick={() => inputRef.current?.click()} aria-label={`${label} ${assetId ? '교체' : '선택'}`}>
          {assetId ? '교체' : '선택'}
        </Button>
        {assetId && (
          <IconButton label={`${label} 제거`} icon={<Trash2 className="size-4" />} variant="surface" onClick={() => onChange(null)} disabled={busy} />
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-label={`${label} 파일 선택`}
          onChange={(e) => void pick(e.target.files?.[0])}
        />
      </div>
      {hint && !error && <p className="text-[12px] text-sub">{hint}</p>}
      {error && (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
