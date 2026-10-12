/**
 * Minimal raster abstraction so the package builder runs with real Canvas in the
 * browser and with a recording fake in unit tests.
 */

export type Ctx = CanvasRenderingContext2D

export interface Surface {
  readonly width: number
  readonly height: number
  readonly ctx: Ctx
  toPng(): Promise<Blob>
}

export interface Decoded {
  readonly width: number
  readonly height: number
  readonly source: CanvasImageSource
  close(): void
}

export interface DecodeOptions {
  /** Decode straight to this pixel size (aspect ratio is the caller's job); avoids a full-size bitmap. */
  resize?: { width: number; height: number }
}

export interface Rasterizer {
  surface(width: number, height: number): Surface
  decode(blob: Blob, options?: DecodeOptions): Promise<Decoded>
}

export class BrowserRasterizer implements Rasterizer {
  surface(width: number, height: number): Surface {
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(w, h)
      const ctx = canvas.getContext('2d') as unknown as Ctx | null
      if (!ctx) throw new Error('2D canvas unavailable')
      return { width: w, height: h, ctx, toPng: () => canvas.convertToBlob({ type: 'image/png' }) }
    }
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas unavailable')
    return {
      width: w,
      height: h,
      ctx,
      toPng: () =>
        new Promise((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
        ),
    }
  }

  async decode(blob: Blob, options: DecodeOptions = {}): Promise<Decoded> {
    const size = options.resize
    const bitmap = await createImageBitmap(blob, {
      imageOrientation: 'from-image',
      ...(size && { resizeWidth: Math.max(1, Math.round(size.width)), resizeHeight: Math.max(1, Math.round(size.height)), resizeQuality: 'medium' as const }),
    })
    return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() }
  }
}

/** Reads width/height from a PNG IHDR chunk. Returns null if not a PNG. */
export async function readPngSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  const head = new Uint8Array(await blob.slice(0, 24).arrayBuffer())
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (head.length < 24 || !sig.every((b, i) => head[i] === b)) return null
  const ihdr = String.fromCharCode(head[12], head[13], head[14], head[15])
  if (ihdr !== 'IHDR') return null
  const view = new DataView(head.buffer)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}
