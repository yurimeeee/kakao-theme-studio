import type { ResolvedBubble } from '@/domain/theme/resolve'
import type { EdgeInsets } from '@/domain/theme/types'
import { CAPSULE_RADIUS_PT, MIN_BUBBLE_CAP_PT } from './catalog'

/**
 * Bubble images use iOS stretchable-image semantics (observed in the reference:
 * `'chatroomBubbleSend01.png' 16px 39px`): the value pair is the left/top cap in pt,
 * and the single pt column/row at that point is stretched.
 */
export interface BubbleGeometry {
  widthPt: number
  heightPt: number
  radiusPt: number
  stretch: { x: number; y: number }
}

export function effectiveRadius(b: Pick<ResolvedBubble, 'shape' | 'radius'>): number {
  if (b.shape === 'capsule') return CAPSULE_RADIUS_PT
  if (b.shape === 'square') return 0
  return b.radius
}

/** Generated bubble: smallest symmetric image whose caps hold the corner radius. */
export function generatedBubbleGeometry(b: Pick<ResolvedBubble, 'shape' | 'radius'>): BubbleGeometry {
  const radiusPt = effectiveRadius(b)
  const cap = Math.max(Math.ceil(radiusPt), MIN_BUBBLE_CAP_PT)
  const size = cap * 2 + 1
  return { widthPt: size, heightPt: size, radiusPt, stretch: { x: cap, y: cap } }
}

/** Image px per bubble pt at a display size (% of the image read as @3x). */
export const pxPerPt = (imageSize: number) => 300 / imageSize

/**
 * User bubble image. At imageSize 100 the file is treated as @3x artwork (pt = px / 3);
 * other sizes scale the whole image, decorations included.
 * The stretch point defaults to the center and is clamped inside the image.
 */
export function imageBubbleGeometry(
  widthPx: number,
  heightPx: number,
  stretch: { x: number; y: number } | null,
  imageSize = 100,
): BubbleGeometry {
  const widthPt = widthPx / pxPerPt(imageSize)
  const heightPt = heightPx / pxPerPt(imageSize)
  const maxX = Math.max(0, Math.floor(widthPt) - 1)
  const maxY = Math.max(0, Math.floor(heightPt) - 1)
  const s = stretch ?? { x: Math.floor(widthPt / 2), y: Math.floor(heightPt / 2) }
  return {
    widthPt,
    heightPt,
    radiusPt: 0,
    stretch: { x: Math.min(Math.max(0, s.x), maxX), y: Math.min(Math.max(0, s.y), maxY) },
  }
}

/** Rounds to the 0.5 pt grid the reference archive also uses. */
export const halfPt = (v: number) => Math.round(v * 2) / 2

/**
 * Pt values of a layout re-expressed for another display size, so the stretch point
 * and text insets stay on the same spot of the image.
 */
export function rescaleLayout<T extends { insets: EdgeInsets; stretch: { x: number; y: number } | null }>(
  layout: T,
  fromSize: number,
  toSize: number,
): T {
  const k = toSize / fromSize
  const s = (v: number) => halfPt(v * k)
  const { insets: i, stretch: st } = layout
  return {
    ...layout,
    insets: { top: s(i.top), left: s(i.left), bottom: s(i.bottom), right: s(i.right) },
    stretch: st ? { x: s(st.x), y: s(st.y) } : null,
  }
}

export interface BubbleFit {
  stretch: { x: number; y: number }
  insets: { top: number; left: number; bottom: number; right: number }
}

/** Minimal RGBA pixel buffer (structurally compatible with `ImageData`). */
export interface Pixels {
  width: number
  height: number
  data: Uint8ClampedArray
}

const SAME_TOLERANCE = 3

/**
 * Which image px lines may be stretched without smearing: `rows[y]` is true when row y
 * equals row y + 1 (same for columns). Transparent margins count as flat.
 */
export function flatLines(px: Pixels): { rows: boolean[]; cols: boolean[] } {
  const { width: w, height: h, data } = px
  const same = (a: number, b: number) =>
    Math.abs(data[a] - data[b]) <= SAME_TOLERANCE &&
    Math.abs(data[a + 1] - data[b + 1]) <= SAME_TOLERANCE &&
    Math.abs(data[a + 2] - data[b + 2]) <= SAME_TOLERANCE &&
    Math.abs(data[a + 3] - data[b + 3]) <= SAME_TOLERANCE
  const rows: boolean[] = []
  for (let y = 0; y < h - 1; y++) {
    let ok = true
    for (let x = 0; x < w && ok; x++) ok = same((y * w + x) * 4, ((y + 1) * w + x) * 4)
    rows.push(ok)
  }
  const cols: boolean[] = []
  for (let x = 0; x < w - 1; x++) {
    let ok = true
    for (let y = 0; y < h && ok; y++) ok = same((y * w + x) * 4, (y * w + x + 1) * 4)
    cols.push(ok)
  }
  return { rows, cols }
}

/** Whether the 1 pt slot at `pt` covers identical image lines (so stretching repeats a plain band). */
export function isFlatSlot(lines: readonly boolean[], pt: number, pxPerPoint: number): boolean {
  const first = Math.floor(pt * pxPerPoint)
  const last = Math.max(first, Math.ceil((pt + 1) * pxPerPoint) - 2)
  for (let i = first; i <= last; i++) if (!lines[i]) return false
  return true
}
const EDGE_TOLERANCE = 8
/** Space between the bubble body's inner edge and the text, in pt. */
const TEXT_PAD = { v: 7, h: 6 }
const INSET_MAX = 40

/**
 * Fit a decorated bubble image (@3x px): the stretch point goes in the middle of the
 * longest band of identical rows/columns, so stretching never smears decorations or
 * corners; text insets keep the text inside the body (below decorations hanging over
 * the top edge). Returns null for images without such bands (e.g. photos).
 */
export function fitBubbleImage(px: Pixels): BubbleFit | null {
  const { width: w, height: h, data } = px
  const at = (x: number, y: number) => (y * w + x) * 4
  const close = (a: number, b: number, tol: number) =>
    Math.abs(data[a] - data[b]) <= tol &&
    Math.abs(data[a + 1] - data[b + 1]) <= tol &&
    Math.abs(data[a + 2] - data[b + 2]) <= tol &&
    Math.abs(data[a + 3] - data[b + 3]) <= tol

  const rowSame = (y: number) => {
    for (let x = 0; x < w; x++) if (!close(at(x, y), at(x, y + 1), SAME_TOLERANCE)) return false
    return true
  }
  const colSame = (x: number) => {
    for (let y = 0; y < h; y++) if (!close(at(x, y), at(x + 1, y), SAME_TOLERANCE)) return false
    return true
  }
  const rowOpaque = (y: number) => {
    for (let x = 0; x < w; x++) if (data[at(x, y) + 3] > 0) return true
    return false
  }
  const colOpaque = (x: number) => {
    for (let y = 0; y < h; y++) if (data[at(x, y) + 3] > 0) return true
    return false
  }

  /** Longest run [start, end] of lines where line i equals line i + 1 (ignoring empty margins). */
  const longestBand = (count: number, same: (i: number) => boolean, opaque: (i: number) => boolean) => {
    let best: [number, number] | null = null
    let start = -1
    for (let i = 0; i <= count - 1; i++) {
      const ok = i < count - 1 && same(i) && opaque(i)
      if (ok && start < 0) start = i
      if (!ok && start >= 0) {
        if (!best || i - start > best[1] - best[0]) best = [start, i] // lines start..i are identical
        start = -1
      }
    }
    return best
  }

  const rows = longestBand(h, rowSame, rowOpaque)
  const cols = longestBand(w, colSame, colOpaque)
  // The stretched pt slot spans 3 px; the band must hold it.
  if (!rows || !cols || rows[1] - rows[0] < 3 || cols[1] - cols[0] < 3) return null

  const slot = (band: [number, number]) => {
    const pt = Math.round((band[0] + band[1]) / 2 / 3)
    return Math.min(Math.max(pt, Math.ceil(band[0] / 3)), Math.floor((band[1] - 2) / 3))
  }
  const sx = slot(cols)
  const sy = slot(rows)
  const cx = sx * 3 + 1
  const cy = sy * 3 + 1
  const fill = at(cx, cy)
  if (data[fill + 3] === 0) return null

  let left = cx
  while (left > 0 && close(at(left - 1, cy), fill, EDGE_TOLERANCE)) left--
  let right = cx
  while (right < w - 1 && close(at(right + 1, cy), fill, EDGE_TOLERANCE)) right++
  let top = cy
  while (top > 0 && close(at(cx, top - 1), fill, EDGE_TOLERANCE)) top--
  let bottom = cy
  while (bottom < h - 1 && close(at(cx, bottom + 1), fill, EDGE_TOLERANCE)) bottom++

  const pt = (v: number) => Math.min(INSET_MAX, Math.max(0, Math.round(v / 3)))
  return {
    stretch: { x: sx, y: sy },
    insets: {
      // Decorations overlapping the body's top edge end where the identical rows begin.
      top: pt(Math.max(top + TEXT_PAD.v * 3, rows[0])),
      left: pt(left + TEXT_PAD.h * 3),
      bottom: pt(h - 1 - bottom + TEXT_PAD.v * 3),
      right: pt(w - 1 - right + TEXT_PAD.h * 3),
    },
  }
}
