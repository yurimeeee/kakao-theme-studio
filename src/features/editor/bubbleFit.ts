import { fitBubbleImage, type BubbleFit } from '@/exporters/ktheme/bubbleGeometry'

/** Decode a bubble image locally and fit stretch point + text insets. Null when not detectable. */
export async function analyzeBubbleImage(blob: Blob): Promise<BubbleFit | null> {
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    try {
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(bitmap, 0, 0)
      return fitBubbleImage(ctx.getImageData(0, 0, bitmap.width, bitmap.height))
    } finally {
      bitmap.close()
    }
  } catch {
    return null
  }
}
