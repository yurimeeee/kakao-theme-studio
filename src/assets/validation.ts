import type { SupportedImageMime } from './types'

/** Protective limits (adjustable, not product-final). Error messages show the real values. */
export const IMAGE_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxSide: 8192,
}

export type ImageErrorCode = 'unsupported-type' | 'too-large' | 'decode-failed' | 'too-many-pixels' | 'empty'

export class ImageValidationError extends Error {
  readonly code: ImageErrorCode

  constructor(code: ImageErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'ImageValidationError'
  }
}

export function imageErrorMessage(code: ImageErrorCode): string {
  switch (code) {
    case 'unsupported-type':
      return '지원하지 않는 파일 형식이에요. PNG, JPEG, WebP 이미지를 선택해 주세요.'
    case 'too-large':
      return `이미지 용량이 너무 커요. ${IMAGE_LIMITS.maxBytes / 1024 / 1024}MB 이하로 선택해 주세요.`
    case 'too-many-pixels':
      return `이미지 크기가 너무 커요. 가로·세로 ${IMAGE_LIMITS.maxSide}px 이하로 선택해 주세요.`
    case 'empty':
    case 'decode-failed':
      return '이미지를 불러오지 못했어요.'
  }
}

const fail = (code: ImageErrorCode) => new ImageValidationError(code, imageErrorMessage(code))

/** Detects the real format from magic bytes — the extension and reported MIME are not trusted. */
export function sniffImageMime(head: Uint8Array): SupportedImageMime | null {
  const at = (i: number, ...bytes: number[]) => bytes.every((b, j) => head[i + j] === b)
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp'
  return null
}

const ALLOWED_DECLARED = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', ''])

export interface ImageDecoder {
  /** Must apply EXIF orientation (browser `createImageBitmap` does by default). */
  (blob: Blob): Promise<{ width: number; height: number }>
}

export const browserDecoder: ImageDecoder = async (blob) => {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  const size = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return size
}

export interface ValidatedImage {
  mime: SupportedImageMime
  width: number
  height: number
}

export async function validateImageFile(file: Blob, decode: ImageDecoder = browserDecoder): Promise<ValidatedImage> {
  if (file.size === 0) throw fail('empty')
  if (!ALLOWED_DECLARED.has(file.type)) throw fail('unsupported-type')
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const mime = sniffImageMime(head)
  if (!mime) throw fail('unsupported-type')
  if (file.size > IMAGE_LIMITS.maxBytes) throw fail('too-large')
  let size: { width: number; height: number }
  try {
    size = await decode(file)
  } catch {
    throw fail('decode-failed')
  }
  if (!size.width || !size.height) throw fail('decode-failed')
  if (size.width > IMAGE_LIMITS.maxSide || size.height > IMAGE_LIMITS.maxSide) throw fail('too-many-pixels')
  return { mime, ...size }
}
