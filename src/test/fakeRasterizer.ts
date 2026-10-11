import type { Decoded, Rasterizer, Surface } from '@/exporters/ktheme/raster'

/** Minimal PNG: signature + IHDR chunk carrying the size (enough for readPngSize). */
export function fakePng(width: number, height: number): Blob {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return new Blob([bytes], { type: 'image/png' })
}

/** Canvas context that accepts any call (we test structure, not pixels). */
function noopContext(): CanvasRenderingContext2D {
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, prop) => (prop === 'then' ? undefined : () => undefined),
    set: () => true,
  })
}

/** Decodes fake PNGs by IHDR; `sizes` overrides by blob identity. */
export class FakeRasterizer implements Rasterizer {
  surfaces: { width: number; height: number }[] = []
  failDecode = new Set<Blob>()

  surface(width: number, height: number): Surface {
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    this.surfaces.push({ width: w, height: h })
    return { width: w, height: h, ctx: noopContext(), toPng: async () => fakePng(w, h) }
  }

  async decode(blob: Blob): Promise<Decoded> {
    if (this.failDecode.has(blob)) throw new Error('decode failed')
    const head = new Uint8Array(await blob.slice(0, 24).arrayBuffer())
    const view = new DataView(head.buffer)
    return { width: view.getUint32(16), height: view.getUint32(20), source: {} as CanvasImageSource, close: () => {} }
  }
}
