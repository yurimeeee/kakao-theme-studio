import { describe, expect, it, vi } from 'vitest'
import { getRepositories } from '@/app/services'
import { importImage } from '@/assets/importImage'
import { createNewProject, THEME_NAME_MAX_LENGTH } from '@/domain/theme/defaults'
import { invertPalette } from '@/domain/theme/scheme'
import { fakePng } from '@/test/fakeRasterizer'
import { copyName, createTonePair, pairName, pairTone } from './duplicate'

describe('copyName', () => {
  it('adds the suffix and keeps the name within the limit', () => {
    expect(copyName('봄 테마')).toBe('봄 테마 사본')
    const long = copyName('가'.repeat(THEME_NAME_MAX_LENGTH))
    expect(long).toHaveLength(THEME_NAME_MAX_LENGTH)
    expect(long.endsWith(' 사본')).toBe(true)
    expect(copyName('가'.repeat(26) + '   끝')).toBe('가'.repeat(26) + ' 사본')
  })
})

describe('pairName', () => {
  it('adds the tone and keeps the name within the limit', () => {
    expect(pairName('봄 테마', 'dark')).toBe('봄 테마 다크')
    expect(pairName('가'.repeat(THEME_NAME_MAX_LENGTH), 'light')).toHaveLength(THEME_NAME_MAX_LENGTH)
  })
})

describe('createTonePair', () => {
  it('stores a dark copy with its own images; the original is untouched', async () => {
    vi.stubGlobal('window', globalThis)
    const { projects, assets } = getRepositories()
    const p = createNewProject()
    const bg = await importImage(p.id, fakePng(40, 80), assets, async () => ({ width: 40, height: 80 }))
    p.name = '낮'
    p.config.background.chatroom = { ...p.config.background.chatroom, mode: 'image', imageAssetId: bg.id }
    p.config.bubbles.send = { ...p.config.bubbles.send, mode: 'color', color: '#ff0000' }
    const original = await projects.save(p, { snapshotAt: Date.now() + 1 })

    const { id, tone } = await createTonePair(original.id)
    expect(tone).toBe('dark')
    const copy = (await projects.get(id))!
    expect(copy.name).toBe('낮 다크')
    expect(copy.exportThemeId).not.toBe(original.exportThemeId)
    expect(copy.config.palette).toEqual(invertPalette(original.config.palette))
    // The send bubble now follows the dark palette; the photo is kept as its own copy.
    expect(copy.config.bubbles.send.mode).toBe('default')
    expect(copy.config.background.chatroom.mode).toBe('image')
    expect(copy.config.background.chatroom.imageAssetId).not.toBe(bg.id)
    expect(await assets.listMeta(copy.id)).toHaveLength(1)
    expect((await projects.get(original.id))!.config).toEqual(original.config)
    expect(pairTone(copy.config)).toBe('light')
  })
})
