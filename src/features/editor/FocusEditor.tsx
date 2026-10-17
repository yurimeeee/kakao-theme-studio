import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { useAssetSize, useAssetUrl } from '@/assets/useAssetUrl'
import { Button } from '@/components/ui/Button'
import { Slider } from '@/components/ui/Slider'
import { centerFocus, FOCUS_ZOOM_MAX } from '@/domain/theme/defaults'
import type { AssetId, ImageFocus } from '@/domain/theme/types'
import { focusedImageStyle } from '../preview/focus'

const KEY_STEP = 0.05
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const round = (v: number) => Math.round(v * 1000) / 1000

interface FocusEditorProps {
  label: string
  assetId: AssetId | null
  focus: ImageFocus
  /** Width / height of the exported frame. */
  aspect: number
  round?: boolean
  onChange: (focus: ImageFocus) => void
}

/**
 * Drag the image (or use the arrow keys) to choose which part fills the frame; the slider
 * enlarges it. The frame shows the exported crop, drawn with the preview's cover math.
 */
export function FocusEditor({ label, assetId, focus, aspect, round: rounded, onChange }: FocusEditorProps) {
  const url = useAssetUrl(assetId)
  const size = useAssetSize(assetId)
  const frameRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; from: ImageFocus } | null>(null)
  if (!url || !size) return null

  /** How far (px) the scaled image overhangs the frame on each axis; 0 = that axis cannot move. */
  const overhang = (zoom: number) => {
    const r = frameRef.current!.getBoundingClientRect()
    const scale = Math.max(r.width / size.width, r.height / size.height) * zoom
    return { x: size.width * scale - r.width, y: size.height * scale - r.height }
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, from: focus }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const o = overhang(d.from.zoom)
    // Dragging the image right shows more of its left side.
    const x = o.x > 0.5 ? round(clamp01(d.from.x - (e.clientX - d.x) / o.x)) : d.from.x
    const y = o.y > 0.5 ? round(clamp01(d.from.y - (e.clientY - d.y) / o.y)) : d.from.y
    if (x !== focus.x || y !== focus.y) onChange({ ...focus, x, y })
  }
  const endDrag = () => void (drag.current = null)

  const onKeyDown = (e: KeyboardEvent) => {
    const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const dir = step[e.key]
    if (!dir) return
    e.preventDefault()
    onChange({ ...focus, x: round(clamp01(focus.x + dir[0] * KEY_STEP)), y: round(clamp01(focus.y + dir[1] * KEY_STEP)) })
  }

  const centered = focus.x === 0.5 && focus.y === 0.5 && focus.zoom === 1
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center rounded-[var(--radius-field)] bg-canvas p-4">
        <div
          ref={frameRef}
          role="group"
          tabIndex={0}
          aria-label={`${label}: 끌거나 방향키로 보일 부분을 골라요`}
          aria-roledescription="위치 조절"
          data-testid="focus-frame"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          className="relative cursor-grab touch-none overflow-hidden bg-surface shadow-[var(--shadow-pop)] outline-offset-4 active:cursor-grabbing"
          style={{
            aspectRatio: aspect,
            ...(aspect < 1 ? { height: 220 } : { width: 160 }),
            borderRadius: rounded ? '40%' : 12,
          }}
        >
          <img src={url} alt="" draggable={false} className="pointer-events-none select-none" style={focusedImageStyle(focus)} />
        </div>
      </div>
      <Slider
        label="확대"
        value={Math.round(focus.zoom * 100)}
        min={100}
        max={FOCUS_ZOOM_MAX * 100}
        step={5}
        unit="%"
        onChange={(v) => onChange({ ...focus, zoom: v / 100 })}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-sub">끌어서 보일 부분을 골라요.</p>
        <Button variant="soft" className="min-h-9 px-4 text-[13px] font-medium" disabled={centered} onClick={() => onChange(centerFocus())}>
          가운데로
        </Button>
      </div>
    </div>
  )
}
