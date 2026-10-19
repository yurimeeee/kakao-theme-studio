import { rgbToHex } from '@/domain/theme/color'
import type { HexColor } from '@/domain/theme/types'

/** What the importer needs to know about one image, so tests can fake it without Canvas. */
export interface ImageSummary {
  width: number
  height: number
  /** The one color of every opaque pixel (solid backgrounds, generated bubbles and dots); null for artwork. */
  solid: HexColor | null
  /** Transparent px along the top-left diagonal before the first opaque pixel (rounded-corner estimate). */
  cornerClear: number
}

export type ImageProbe = (blob: Blob) => Promise<ImageSummary>

/** Pixel analysis is done on at most this many px per side (enough for colors and small bubble corners). */
const MAX_SIDE = 256
const OPAQUE = 250
const TOLERANCE = 3

export function summarizePixels(data: Uint8ClampedArray, width: number, height: number): Omit<ImageSummary, 'width' | 'height'> {
  let first: [number, number, number] | null = null
  let solid = true
  for (let i = 0; i < data.length && solid; i += 4) {
    if (data[i + 3] < OPAQUE) continue
    const rgb: [number, number, number] = [data[i], data[i + 1], data[i + 2]]
    if (!first) first = rgb
    else if (rgb.some((v, j) => Math.abs(v - first![j]) > TOLERANCE)) solid = false
  }
  let cornerClear = 0
  const diagonal = Math.min(width, height)
  while (cornerClear < diagonal && data[(cornerClear * width + cornerClear) * 4 + 3] < 128) cornerClear++
  return { solid: solid && first ? rgbToHex(...first) : null, cornerClear }
}

export const browserProbe: ImageProbe = async (blob) => {
  const bitmap = await createImageBitmap(blob)
  try {
    const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * k))
    const h = Math.max(1, Math.round(bitmap.height * k))
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null
    if (!ctx) throw new Error('2D canvas unavailable')
    ctx.drawImage(bitmap, 0, 0, w, h)
    const summary = summarizePixels(ctx.getImageData(0, 0, w, h).data, w, h)
    // Report the corner in source px so callers can convert with the file's scale.
    return { width: bitmap.width, height: bitmap.height, ...summary, cornerClear: Math.round(summary.cornerClear / k) }
  } finally {
    bitmap.close()
  }
}
