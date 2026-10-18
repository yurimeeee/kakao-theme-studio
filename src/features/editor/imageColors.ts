import { imageColors, type ImageColors } from '@/domain/theme/scheme'

/** Longest side the image is reduced to before counting colors; enough for main colors. */
const SAMPLE = 96

const cache = new WeakMap<Blob, Promise<ImageColors | null>>()

/** Main colors of an image, decoded locally at a small size. Null when it cannot be decoded. */
export function readImageColors(blob: Blob): Promise<ImageColors | null> {
  let pending = cache.get(blob)
  if (!pending) {
    pending = sample(blob)
    cache.set(blob, pending)
  }
  return pending
}

async function sample(blob: Blob): Promise<ImageColors | null> {
  try {
    const probe = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    const scale = Math.min(1, SAMPLE / Math.max(probe.width, probe.height))
    const width = Math.max(1, Math.round(probe.width * scale))
    const height = Math.max(1, Math.round(probe.height * scale))
    probe.close()
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image', resizeWidth: width, resizeHeight: height, resizeQuality: 'medium' })
    try {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(bitmap, 0, 0)
      return imageColors(ctx.getImageData(0, 0, width, height))
    } finally {
      bitmap.close()
    }
  } catch {
    return null
  }
}
