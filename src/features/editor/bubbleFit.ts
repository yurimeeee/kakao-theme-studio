import { fitBubbleImage, flatLines, type BubbleFit, type Pixels } from '@/exporters/ktheme/bubbleGeometry'

/** Decode an image locally and read its pixels. Null when the browser cannot decode it. */
async function readPixels<T>(blob: Blob, read: (px: Pixels) => T): Promise<T | null> {
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    try {
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(bitmap, 0, 0)
      return read(ctx.getImageData(0, 0, bitmap.width, bitmap.height))
    } finally {
      bitmap.close()
    }
  } catch {
    return null
  }
}

/** Fit stretch point + text insets (pt at @3x). Null when not detectable. */
export async function analyzeBubbleImage(blob: Blob): Promise<BubbleFit | null> {
  return (await readPixels(blob, fitBubbleImage)) ?? null
}

/** Rows/columns that stretch cleanly, for the layout editor's warnings. */
export function analyzeBubbleLines(blob: Blob) {
  return readPixels(blob, flatLines)
}
