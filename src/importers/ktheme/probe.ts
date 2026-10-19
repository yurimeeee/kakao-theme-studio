import { rgbToHex } from '@/domain/theme/color'
import type { HexColor } from '@/domain/theme/types'
import { BrowserRasterizer, type Ctx, type Decoded } from '@/exporters/ktheme/raster'

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

/** Draws what a generated resource would look like at `size`; `decode` opens other images it needs. */
export type ExpectedDrawing = (ctx: Ctx, size: number, decode: (blob: Blob) => Promise<Decoded>) => void | Promise<void>

/** Whether a square image is (close to) a drawing this app generates, e.g. the default profile. */
export type DrawingMatcher = (blob: Blob, expected: ExpectedDrawing) => Promise<boolean>

export interface ImageInspector {
  summarize: ImageProbe
  matches: DrawingMatcher
}

const COMPARE_SIZE = 128
/** Mean per-channel difference (0–255) still counted as the same picture: covers resampling and PNG rounding. */
const SAME_PICTURE = 6

export function meanDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
  return a.length ? sum / a.length : Infinity
}

export const browserMatcher: DrawingMatcher = async (blob, expected) => {
  const raster = new BrowserRasterizer()
  const opened: Decoded[] = []
  const decode = async (b: Blob) => {
    const d = await raster.decode(b)
    opened.push(d)
    return d
  }
  try {
    const image = await decode(blob)
    if (Math.abs(image.width - image.height) > 1) return false
    const actual = raster.surface(COMPARE_SIZE, COMPARE_SIZE)
    actual.ctx.drawImage(image.source, 0, 0, COMPARE_SIZE, COMPARE_SIZE)
    const drawn = raster.surface(COMPARE_SIZE, COMPARE_SIZE)
    await expected(drawn.ctx, COMPARE_SIZE, decode)
    const pixels = (s: typeof actual) => s.ctx.getImageData(0, 0, COMPARE_SIZE, COMPARE_SIZE).data
    return meanDifference(pixels(actual), pixels(drawn)) <= SAME_PICTURE
  } catch {
    return false
  } finally {
    for (const d of opened) d.close()
  }
}

export const browserInspector: ImageInspector = { summarize: browserProbe, matches: browserMatcher }
