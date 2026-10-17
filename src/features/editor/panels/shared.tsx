import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ColorField } from '@/components/ui/ColorField'
import { NEUTRAL_SWATCHES } from '@/components/ui/swatches'
import { Segmented } from '@/components/ui/Segmented'
import type { FillSetting, HexColor } from '@/domain/theme/types'
import { FocusEditor } from '../FocusEditor'
import { ImageField } from '../ImageField'
import { modeOptions } from './modes'

interface FillEditorProps {
  label: string
  fill: FillSetting
  defaultColor: HexColor
  onChange: (next: FillSetting) => void
  imageHint?: string
  /** Exported frame size; adds the crop position editor for images. */
  frame?: { w: number; h: number }
}

/**
 * 기본 / 색상 / 이미지 editor. Switching modes keeps the other branch's value, so
 * an uploaded image survives a temporary switch to color.
 */
export function FillEditor({ label, fill, defaultColor, onChange, imageHint, frame }: FillEditorProps) {
  return (
    <div className="flex flex-col gap-4">
      <Segmented label={`${label} 방식`} hideLabel value={fill.mode} options={modeOptions(['default', 'color', 'image'] as const)} onChange={(mode) => onChange({ ...fill, mode })} />
      {fill.mode === 'default' && <p className="text-[13px] text-sub">전체 색상의 주요 배경({defaultColor.toUpperCase()})을 따라요.</p>}
      {fill.mode === 'color' && <ColorField label={`${label} 색상`} value={fill.color} swatches={NEUTRAL_SWATCHES} onChange={(color) => onChange({ ...fill, color })} />}
      {fill.mode === 'image' && (
        <>
          <ImageField label={`${label} 이미지`} assetId={fill.imageAssetId} onChange={(imageAssetId) => onChange({ ...fill, imageAssetId })} hint={imageHint} />
          {frame && fill.imageAssetId && (
            <FocusEditor label={`${label} 위치`} assetId={fill.imageAssetId} focus={fill.focus} aspect={frame.w / frame.h} onChange={(focus) => onChange({ ...fill, focus })} />
          )}
        </>
      )}
    </div>
  )
}

export function Advanced({ children, title = '고급 설정' }: { children: ReactNode; title?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="rounded-[var(--radius-field)] bg-canvas">
      <Collapsible.Trigger className="flex min-h-12 w-full items-center justify-between rounded-[var(--radius-field)] px-4 text-[14px] font-medium text-ink">
        {title}
        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </Collapsible.Trigger>
      <Collapsible.Content className="flex flex-col gap-4 px-4 pb-4">{children}</Collapsible.Content>
    </Collapsible.Root>
  )
}
