import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { BubbleImageLayout, EdgeInsets } from '@/domain/theme/types'
import { halfPt, imageBubbleGeometry, isFlatSlot, pxPerPt } from '@/exporters/ktheme/bubbleGeometry'

interface Lines {
  rows: boolean[]
  cols: boolean[]
}

interface BubbleLayoutEditorProps {
  imageUrl: string
  widthPx: number
  heightPx: number
  layout: BubbleImageLayout
  /** Flat image lines (null while analyzing or when the image cannot be read). */
  lines: Lines | null
  onChange: (patch: Partial<Pick<BubbleImageLayout, 'stretch' | 'insets'>>) => void
}

/** Room around the image for edge handles, CSS px. */
const PAD = 14
const MAX_HEIGHT = 260
const MAX_ZOOM = 8
const OUTLINE = '0 0 0 1px rgb(255 255 255 / 0.9)'
const INSET_LABELS: Record<keyof EdgeInsets, string> = { top: '위 여백', right: '오른쪽 여백', bottom: '아래 여백', left: '왼쪽 여백' }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Runs of flat lines as [startPt, endPt) on the bubble's pt axis. */
function flatRuns(lines: boolean[], k: number): [number, number][] {
  const runs: [number, number][] = []
  let start = -1
  for (let i = 0; i <= lines.length; i++) {
    if (lines[i] && start < 0) start = i
    if (!lines[i] && start >= 0) {
      runs.push([start / k, (i + 1) / k]) // lines start..i are identical
      start = -1
    }
  }
  return runs
}

/** Arrow-key stepping for a handle: 0.5 pt, or 5 pt with Shift. */
function stepKeys(e: KeyboardEvent, axis: 'x' | 'y', apply: (delta: number) => void) {
  const step = e.shiftKey ? 5 : 0.5
  const keys = axis === 'x' ? { ArrowLeft: -step, ArrowRight: step } : { ArrowUp: -step, ArrowDown: step }
  const delta = keys[e.key as keyof typeof keys]
  if (delta === undefined) return
  e.preventDefault()
  apply(delta)
}

/**
 * Draws the bubble image enlarged with its stretch point (crosshair, the 1 pt slot that
 * stretches) and text area (dashed box). Both are dragged directly, or moved with arrow keys.
 * Rulers mark where the image has plain bands that stretch without smearing decorations.
 */
export function BubbleLayoutEditor({ imageUrl, widthPx, heightPx, layout, lines, onChange }: BubbleLayoutEditorProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(0)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const g = imageBubbleGeometry(widthPx, heightPx, layout.stretch, layout.imageSize)
  const W = g.widthPt
  const H = g.heightPt
  const zoom = available > 0 ? Math.min((available - PAD * 2) / W, MAX_HEIGHT / H, MAX_ZOOM) : 0
  const { insets } = layout
  const st = g.stretch
  const maxX = Math.max(0, Math.floor(W) - 1)
  const maxY = Math.max(0, Math.floor(H) - 1)

  const k = pxPerPt(layout.imageSize)
  const flatX = lines ? isFlatSlot(lines.cols, st.x, k) : true
  const flatY = lines ? isFlatSlot(lines.rows, st.y, k) : true

  const setStretch = (x: number, y: number) => onChange({ stretch: { x: halfPt(clamp(x, 0, maxX)), y: halfPt(clamp(y, 0, maxY)) } })
  const setInset = (side: keyof EdgeInsets, v: number) => {
    const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const
    const span = side === 'top' || side === 'bottom' ? H : W
    onChange({ insets: { ...insets, [side]: halfPt(clamp(v, 0, span - insets[opposite[side]])) } })
  }

  /** Pointer drag reporting the pointer position in bubble pt. */
  const drag = (move: (p: { x: number; y: number }) => void) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      e.currentTarget.focus()
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId) || !boxRef.current) return
      const r = boxRef.current.getBoundingClientRect()
      move({ x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom })
    },
  })

  const slider = (label: string, value: number, min: number, max: number) => ({
    role: 'slider',
    tabIndex: 0,
    'aria-label': label,
    'aria-valuemin': min,
    'aria-valuemax': max,
    'aria-valuenow': value,
    'aria-valuetext': `${value}pt`,
  })

  const textBox = {
    left: insets.left * zoom,
    top: insets.top * zoom,
    width: Math.max(0, W - insets.left - insets.right) * zoom,
    height: Math.max(0, H - insets.top - insets.bottom) * zoom,
  }
  const handleCls = 'absolute z-10 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ink shadow touch-none focus-visible:outline-2'

  return (
    <div className="flex flex-col gap-3">
      <div ref={wrapRef} className="w-full">
        {zoom > 0 && (
          <div className="relative mx-auto" style={{ width: W * zoom + PAD * 2, height: H * zoom + PAD * 2 }}>
            {/* Rulers: plain bands that stretch cleanly. */}
            {lines && (
              <>
                <div className="absolute h-1 rounded-full bg-canvas-strong" style={{ left: PAD, top: 3, width: W * zoom }} aria-hidden>
                  {flatRuns(lines.cols, k).map(([a, b]) => (
                    <span key={a} className="absolute inset-y-0 rounded-full bg-sub" style={{ left: a * zoom, width: (b - a) * zoom }} />
                  ))}
                </div>
                <div className="absolute w-1 rounded-full bg-canvas-strong" style={{ top: PAD, left: 3, height: H * zoom }} aria-hidden>
                  {flatRuns(lines.rows, k).map(([a, b]) => (
                    <span key={a} className="absolute inset-x-0 rounded-full bg-sub" style={{ top: a * zoom, height: (b - a) * zoom }} />
                  ))}
                </div>
              </>
            )}
            <div
              ref={boxRef}
              className="absolute bg-[length:12px_12px] [background-image:repeating-conic-gradient(var(--color-canvas-strong)_0_25%,transparent_0_50%)]"
              style={{ left: PAD, top: PAD, width: W * zoom, height: H * zoom }}
            >
              <img src={imageUrl} alt="" draggable={false} className="pointer-events-none size-full select-none" />

              {/* Text area */}
              <div
                className="pointer-events-none absolute border border-dashed border-ink"
                style={{ ...textBox, boxShadow: OUTLINE }}
                aria-hidden
              />
              {(['top', 'right', 'bottom', 'left'] as const).map((side) => {
                const horizontal = side === 'left' || side === 'right'
                const pos = {
                  top: { left: textBox.left + textBox.width / 2, top: textBox.top },
                  bottom: { left: textBox.left + textBox.width / 2, top: textBox.top + textBox.height },
                  left: { left: textBox.left, top: textBox.top + textBox.height / 2 },
                  right: { left: textBox.left + textBox.width, top: textBox.top + textBox.height / 2 },
                }[side]
                const span = horizontal ? W : H
                const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const
                return (
                  <span
                    key={side}
                    className={`${handleCls} !rounded-[3px] ${horizontal ? 'cursor-ew-resize' : 'cursor-ns-resize'}`}
                    style={pos}
                    {...slider(INSET_LABELS[side], insets[side], 0, halfPt(span - insets[opposite[side]]))}
                    {...drag((p) =>
                      setInset(side, { top: p.y, bottom: H - p.y, left: p.x, right: W - p.x }[side]),
                    )}
                    onKeyDown={(e) => {
                      // Keys move the edge on screen: → moves the right edge outward (smaller inset).
                      const sign = side === 'right' || side === 'bottom' ? -1 : 1
                      stepKeys(e, horizontal ? 'x' : 'y', (d) => setInset(side, insets[side] + sign * d))
                    }}
                  />
                )
              })}

              {/* Stretch slot (1 pt) and crosshair */}
              <div
                className={`absolute inset-y-0 cursor-ew-resize touch-none ${flatX ? 'bg-ink/25' : 'bg-danger/40'}`}
                style={{ left: st.x * zoom, width: Math.max(2, zoom), boxShadow: OUTLINE }}
                {...slider('늘림 기준점 가로', st.x, 0, maxX)}
                {...drag((p) => setStretch(p.x - 0.5, st.y))}
                onKeyDown={(e) => stepKeys(e, 'x', (d) => setStretch(st.x + d, st.y))}
              />
              <div
                className={`absolute inset-x-0 cursor-ns-resize touch-none ${flatY ? 'bg-ink/25' : 'bg-danger/40'}`}
                style={{ top: st.y * zoom, height: Math.max(2, zoom), boxShadow: OUTLINE }}
                {...slider('늘림 기준점 세로', st.y, 0, maxY)}
                {...drag((p) => setStretch(st.x, p.y - 0.5))}
                onKeyDown={(e) => stepKeys(e, 'y', (d) => setStretch(st.x, st.y + d))}
              />
              <span
                className={`${handleCls} cursor-move`}
                style={{ left: (st.x + 0.5) * zoom, top: (st.y + 0.5) * zoom }}
                tabIndex={-1}
                aria-hidden
                {...drag((p) => setStretch(p.x - 0.5, p.y - 0.5))}
              />
            </div>
          </div>
        )}
      </div>
      <ul className="flex flex-col gap-1 text-[12px] leading-relaxed text-sub">
        <li>
          <span className="font-medium text-ink">십자선</span>: 늘어나는 1pt 줄이에요. 끌어서 옮겨요.
        </li>
        <li>
          <span className="font-medium text-ink">점선 상자</span>: 글자가 들어가는 자리예요. 네 변의 손잡이로 여백을 조절해요.
        </li>
        {lines && <li>위·왼쪽 막대의 진한 구간에 십자선을 두면 장식 없이 깔끔하게 늘어나요.</li>}
      </ul>
      {(!flatX || !flatY) && (
        <p className="rounded-[var(--radius-field)] bg-canvas px-4 py-3 text-[13px] text-danger" role="status">
          {!flatX && !flatY ? '가로·세로 늘림 줄이' : !flatX ? '세로선(가로로 늘어나는 줄)이' : '가로선(세로로 늘어나는 줄)이'} 장식이나 모서리에
          걸려 있어요. 긴 메시지에서 그 부분이 늘어나 보여요.
        </p>
      )}
    </div>
  )
}
