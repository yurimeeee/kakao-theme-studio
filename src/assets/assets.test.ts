import { describe, expect, it, vi } from 'vitest'
import { fakePng } from '@/test/fakeRasterizer'
import { ObjectUrlCache } from './objectUrls'
import { IMAGE_LIMITS, ImageValidationError, sniffImageMime, validateImageFile } from './validation'

const okDecode = async () => ({ width: 100, height: 80 })

async function code(p: Promise<unknown>) {
  try {
    await p
    return 'ok'
  } catch (e) {
    return e instanceof ImageValidationError ? e.code : 'other'
  }
}

describe('validateImageFile', () => {
  it('accepts a real PNG and reports decoded size', async () => {
    await expect(validateImageFile(fakePng(10, 10), okDecode)).resolves.toEqual({ mime: 'image/png', width: 100, height: 80 })
  })

  it('rejects a text file renamed to .png (magic bytes, not extension)', async () => {
    const fake = new File(['hello'], 'photo.png', { type: 'image/png' })
    expect(await code(validateImageFile(fake, okDecode))).toBe('unsupported-type')
  })

  it('rejects unsupported declared types such as GIF/SVG', async () => {
    expect(await code(validateImageFile(new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }), okDecode))).toBe('unsupported-type')
  })

  it('rejects files over the size limit', async () => {
    const big = new Blob([fakePng(1, 1), new Uint8Array(IMAGE_LIMITS.maxBytes)], { type: 'image/png' })
    expect(await code(validateImageFile(big, okDecode))).toBe('too-large')
  })

  it('rejects images that fail to decode', async () => {
    expect(await code(validateImageFile(fakePng(1, 1), () => Promise.reject(new Error('bad'))))).toBe('decode-failed')
  })

  it('rejects images over the pixel limit', async () => {
    const huge = async () => ({ width: IMAGE_LIMITS.maxSide + 1, height: 10 })
    expect(await code(validateImageFile(fakePng(1, 1), huge))).toBe('too-many-pixels')
  })

  it('rejects empty files', async () => {
    expect(await code(validateImageFile(new Blob([]), okDecode))).toBe('empty')
  })

  it('sniffs JPEG and WebP', () => {
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')
    expect(sniffImageMime(webp)).toBe('image/webp')
  })
})

describe('ObjectUrlCache', () => {
  it('reference-counts and revokes on last release', () => {
    const revoke = vi.fn()
    let n = 0
    const cache = new ObjectUrlCache(() => `blob:${++n}`, revoke)
    const blob = new Blob(['x'])
    expect(cache.acquire('ast_a', blob)).toBe('blob:1')
    expect(cache.acquire('ast_a', blob)).toBe('blob:1')
    cache.release('ast_a')
    expect(revoke).not.toHaveBeenCalled()
    cache.release('ast_a')
    expect(revoke).toHaveBeenCalledWith('blob:1')
    expect(cache.size).toBe(0)
  })
})
