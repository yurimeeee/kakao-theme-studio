import type { ResolvedBubble } from '@/domain/theme/resolve'
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

/**
 * User bubble image. The uploaded file is treated as @3x artwork; pt = px / 3.
 * The stretch point defaults to the center and is clamped inside the image.
 */
export function imageBubbleGeometry(
  widthPx: number,
  heightPx: number,
  stretch: { x: number; y: number } | null,
): BubbleGeometry {
  const widthPt = widthPx / 3
  const heightPt = heightPx / 3
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
