import { describe, expect, it } from 'vitest'
import { contrastRatio, hexToRgb, relativeLuminance } from './color'
import { createDefaultConfig } from './defaults'
import { presetConfig, THEME_PRESETS } from './presets'
import { resolveTheme } from './resolve'
import { applyScheme, hexToHsl, hslToHex, imageColors, invertPalette, paletteTone, schemeFromSeed, type PixelData } from './scheme'

/** An image made of solid color runs: [hex, pixel count][]. */
function pixels(runs: [string, number][]): PixelData {
  const total = runs.reduce((n, [, c]) => n + c, 0)
  const data = new Uint8ClampedArray(total * 4)
  let i = 0
  for (const [hex, count] of runs) {
    const [r, g, b] = hexToRgb(hex)
    for (let k = 0; k < count; k++, i += 4) data.set([r, g, b, 255], i)
  }
  return { data, width: total, height: 1 }
}

describe('hsl conversion', () => {
  it('round-trips', () => {
    for (const hex of ['#ff8800', '#336699', '#ffffff', '#000000', '#7a2fd0']) {
      const [h, s, l] = hexToHsl(hex)
      expect(hslToHex(h, s, l)).toBe(hex)
    }
  })
})

describe('schemeFromSeed', () => {
  const seeds = ['#ffe812', '#3b82f6', '#ffffff', '#000000', '#f472b6', '#14532d', '#808080', '#e11d48', '#0ea5e9', '#a3e635']
  it.each(seeds)('keeps text readable on the background (%s)', (seed) => {
    for (const tone of ['light', 'dark'] as const) {
      const p = schemeFromSeed(seed, tone)
      expect(contrastRatio(p.text, p.background)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(p.subText, p.background)).toBeGreaterThanOrEqual(3)
      // 강조색 (send bubble) stays visible on the background.
      expect(contrastRatio(p.accent, p.background)).toBeGreaterThanOrEqual(1.3)
      const send = resolveTheme({ ...createDefaultConfig(), palette: p }).bubbles.send
      expect(contrastRatio(send.textColor, send.color)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('follows the tone and keeps the seed hue', () => {
    const light = schemeFromSeed('#3b82f6', 'light')
    const dark = schemeFromSeed('#3b82f6', 'dark')
    expect(hexToHsl(light.background)[2]).toBeGreaterThan(0.9)
    expect(hexToHsl(dark.background)[2]).toBeLessThan(0.2)
    expect(Math.abs(hexToHsl(light.accent)[0] - hexToHsl('#3b82f6')[0])).toBeLessThan(3)
  })
})

describe('imageColors', () => {
  it('lists main colors by coverage and merges near duplicates', () => {
    const result = imageColors(pixels([['#f5f0e6', 600], ['#f3eee4', 100], ['#2f6fdb', 250], ['#111111', 50]]))!
    expect(result.colors).toHaveLength(3)
    expect(result.colors[0]).toMatch(/^#f[0-9a-f]{5}$/)
    // The blue is less common than the cream but far more colorful.
    expect(result.base).toBe(result.colors[0])
    expect(result.seed).toBe('#2f6fdb')
    expect(result.tone).toBe('light')
  })

  it('reads a dark image as dark and ignores specks and transparency', () => {
    const img = pixels([['#101418', 900], ['#ff0000', 10], ['#ffffff', 300]])
    // Make the white run transparent.
    for (let i = 910 * 4 + 3; i < img.data.length; i += 4) img.data[i] = 0
    const result = imageColors(img)!
    expect(result.tone).toBe('dark')
    expect(result.colors).not.toContain('#ffffff')
    expect(result.seed).toBe('#101418')
    expect(result.base).toBe('#101418')
  })

  it('does not pick a seed that blends into the main color', () => {
    // A big vivid orange field with a small dull green: orange is the base, so green leads.
    const result = imageColors(pixels([['#f08a3c', 800], ['#5a7a5f', 200]]))!
    expect(result.base).toBe('#f08a3c')
    expect(result.seed).toBe('#5a7a5f')
  })

  it('keeps the send bubble apart from the image backdrop', () => {
    const p = schemeFromSeed('#f8d5c0', 'light', '#f8d5c0')
    expect(contrastRatio(p.accent, '#f8d5c0')).toBeGreaterThanOrEqual(1.3)
    const send = resolveTheme({ ...createDefaultConfig(), palette: p }).bubbles.send
    expect(contrastRatio(send.textColor, send.color)).toBeGreaterThanOrEqual(4.5)
  })

  it('returns null for a fully transparent image', () => {
    expect(imageColors({ data: new Uint8ClampedArray(16), width: 4, height: 1 })).toBeNull()
  })
})

describe('applyScheme', () => {
  it('sets the palette and makes colored elements follow it, keeping images', () => {
    const c = createDefaultConfig()
    c.background.main = { ...c.background.main, mode: 'color', color: '#ff0000' }
    c.background.chatroom = { ...c.background.chatroom, mode: 'image', imageAssetId: 'ast_bg' }
    c.bubbles.send = { ...c.bubbles.send, mode: 'color', color: '#00ff00', textColor: '#123456' }
    c.bubbles.receive = { ...c.bubbles.receive, mode: 'image', imageAssetId: 'ast_b', textColor: '#654321' }
    c.headerInput.mode = 'color'
    c.passcode.titleColor = '#abcdef'
    const palette = schemeFromSeed('#3b82f6', 'light')
    applyScheme(c, palette)
    expect(c.palette).toEqual(palette)
    expect(c.background.main.mode).toBe('default')
    expect(c.background.chatroom).toMatchObject({ mode: 'image', imageAssetId: 'ast_bg' })
    expect(c.bubbles.send).toMatchObject({ mode: 'default', textColor: null })
    expect(c.bubbles.receive).toMatchObject({ mode: 'image', textColor: '#654321' })
    expect(c.headerInput.mode).toBe('default')
    expect(c.passcode.titleColor).toBeNull()
    const theme = resolveTheme(c)
    expect(theme.bubbles.send.color).toBe(palette.accent)
    expect(contrastRatio(theme.bubbles.send.textColor, theme.bubbles.send.color)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('invertPalette (다크/라이트 사본)', () => {
  it.each(THEME_PRESETS)('$name flips tone and stays readable', (preset) => {
    const inverted = invertPalette(preset.palette)
    expect(paletteTone(inverted)).not.toBe(paletteTone(preset.palette))
    expect(contrastRatio(inverted.text, inverted.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(inverted.subText, inverted.background)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(inverted.accent, inverted.background)).toBeGreaterThanOrEqual(1.3)
    const send = resolveTheme(presetConfig({ ...preset, palette: inverted })).bubbles.send
    expect(contrastRatio(send.textColor, send.color)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps a colorful accent and turns black and white around', () => {
    const yellow = THEME_PRESETS.find((p) => p.id === 'kakao')!.palette
    expect(invertPalette(yellow).accent).toBe(yellow.accent)
    const mono = invertPalette(THEME_PRESETS.find((p) => p.id === 'mono')!.palette)
    expect(relativeLuminance(mono.accent)).toBeGreaterThan(0.7)
    expect(hexToHsl(mono.background)[1]).toBe(0)
    // A soft near-black, not pure black.
    expect(mono.background).not.toBe('#000000')
  })

  it('comes back to the same tone after two flips', () => {
    const night = THEME_PRESETS.find((p) => p.id === 'night')!.palette
    const twice = invertPalette(invertPalette(night))
    expect(paletteTone(twice)).toBe('dark')
    expect(Math.abs(hexToHsl(twice.background)[0] - hexToHsl(night.background)[0])).toBeLessThan(10)
  })
})
