import type { CSSProperties } from 'react'
import type { ImageFocus } from '@/domain/theme/types'

/**
 * Style for an <img> that fills its positioned parent like the exporter's drawCover: an
 * oversized box (zoom) shifted toward the focus, with object-fit cover inside it.
 */
export function focusedImageStyle(focus: ImageFocus): CSSProperties {
  const { x, y, zoom } = focus
  return {
    position: 'absolute',
    left: `${-(zoom - 1) * x * 100}%`,
    top: `${-(zoom - 1) * y * 100}%`,
    width: `${zoom * 100}%`,
    height: `${zoom * 100}%`,
    maxWidth: 'none',
    objectFit: 'cover',
    objectPosition: `${x * 100}% ${y * 100}%`,
  }
}

/**
 * background-size/position for a focused cover fill. Past zoom 1 the limiting axis is needed,
 * so the image size and the frame size are taken into account.
 */
export function focusedBackground(focus: ImageFocus, image: { width: number; height: number } | null, frame: { w: number; h: number }): CSSProperties {
  const widthLimited = !image || frame.w / image.width >= frame.h / image.height
  const pct = `${focus.zoom * 100}%`
  return {
    backgroundSize: focus.zoom === 1 ? 'cover' : widthLimited ? `${pct} auto` : `auto ${pct}`,
    backgroundPosition: `${focus.x * 100}% ${focus.y * 100}%`,
    backgroundRepeat: 'no-repeat',
  }
}
