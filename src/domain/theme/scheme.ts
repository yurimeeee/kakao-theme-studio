import { contrastRatio, hexToRgb, readableOn, relativeLuminance, rgbToHex } from './color'
import type { HexColor, PaletteSetting, ThemeConfig } from './types'

/**
 * Color schemes: a whole 전체 색상 palette from one seed color, and seed candidates read
 * from an image. Pure functions, no DOM.
 */

export type SchemeTone = 'light' | 'dark'

type Hsl = [h: number, s: number, l: number]

export function hexToHsl(hex: HexColor): Hsl {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

export function hslToHex(h: number, s: number, l: number): HexColor {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Moves `color`'s lightness away from `bg` until the ratio reaches `min` (or the end of the range). */
function separate(color: HexColor, bg: HexColor, min: number): HexColor {
  if (contrastRatio(color, bg) >= min) return color
  const [h, s, l] = hexToHsl(color)
  const dir = relativeLuminance(bg) > 0.4 ? -1 : 1
  for (let next = l; next >= 0 && next <= 1; next += dir * 0.02) {
    const c = hslToHex(h, s, next)
    if (contrastRatio(c, bg) >= min) return c
  }
  return readableOn(bg, color, min)
}

/**
 * The four palette colors from one seed: a tinted background, near-neutral text in the same
 * hue, and the seed itself as 강조색 (send bubble, send button), nudged off the background.
 * Text is always readable (4.5:1, 보조 글자 3:1). `backdrop` is the main color of a background
 * image the bubbles sit on; the send bubble is kept apart from it too.
 */
export function schemeFromSeed(seed: HexColor, tone: SchemeTone, backdrop?: HexColor): PaletteSetting {
  const [h, s, l] = hexToHsl(seed)
  const background = tone === 'light' ? hslToHex(h, Math.min(s, 0.45), 0.965) : hslToHex(h, Math.min(s, 0.3), 0.13)
  const text = separate(tone === 'light' ? hslToHex(h, Math.min(s, 0.2), 0.14) : hslToHex(h, Math.min(s, 0.12), 0.93), background, 4.5)
  const subText = separate(tone === 'light' ? hslToHex(h, Math.min(s, 0.12), 0.47) : hslToHex(h, Math.min(s, 0.1), 0.66), background, 3)
  // Very light or very dark seeds would vanish into the background; keep their hue, move them inward.
  const accentBase = tone === 'light' ? hslToHex(h, s, clamp(l, 0.3, 0.86)) : hslToHex(h, s, clamp(l, 0.32, 0.7))
  let accent = separate(bubbleSafe(accentBase, text), background, 1.3)
  if (backdrop) accent = bubbleSafe(separate(accent, backdrop, 1.3), text)
  return { background, text, subText, accent }
}

/**
 * Mid tones read badly with dark and light text alike; move to the nearest lightness where the
 * send bubble's automatic text color (same rule as resolveTheme) reaches 4.5:1.
 */
function bubbleSafe(color: HexColor, text: HexColor): HexColor {
  const ok = (c: HexColor) => contrastRatio(readableOn(c, text, 4.5), c) >= 4.5
  if (ok(color)) return color
  const [h, s, l] = hexToHsl(color)
  for (let step = 0.02; step <= 0.5; step += 0.02) {
    for (const next of [l + step, l - step]) {
      if (next < 0 || next > 1) continue
      const c = hslToHex(h, s, next)
      if (ok(c)) return c
    }
  }
  return color
}

/** RGBA pixels, row-major (ImageData-compatible). */
export interface PixelData {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface ImageColors {
  /** Distinct main colors, most covering first. */
  colors: HexColor[]
  /** The most covering color: what bubbles and text mostly sit on. */
  base: HexColor
  /** The color to build the scheme from: colorful, covers enough of the image, stands out from `base`. */
  seed: HexColor
  /** Light or dark scheme, so text and bubbles sit well on the image. */
  tone: SchemeTone
}

const distance = (a: HexColor, b: HexColor) => {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return Math.hypot(ar - br, ag - bg, ab - bb)
}

/**
 * Main colors of an image by 4-bit-per-channel buckets (averaged inside each bucket), merging
 * near duplicates. Transparent pixels are ignored. Null for a fully transparent image.
 */
export function imageColors(px: PixelData, max = 6): ImageColors | null {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>()
  let total = 0
  let lum = 0
  const d = px.data
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const e = buckets.get(key)
    if (e) {
      e.r += r
      e.g += g
      e.b += b
      e.n++
    } else buckets.set(key, { r, g, b, n: 1 })
    total++
    lum += relativeLuminance(rgbToHex(r, g, b))
  }
  if (!total) return null

  const ranked = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map((e) => ({ color: rgbToHex(e.r / e.n, e.g / e.n, e.b / e.n), share: e.n / total }))
  const picked: { color: HexColor; share: number }[] = []
  for (const c of ranked) {
    const near = picked.find((p) => distance(p.color, c.color) < 56)
    if (near) near.share += c.share
    else if (picked.length < max) picked.push({ ...c })
  }
  picked.sort((a, b) => b.share - a.share)

  // Colorful beats merely common, but a tiny speck should not set the whole theme.
  const score = (p: { color: HexColor; share: number }) => {
    const [, s, l] = hexToHsl(p.color)
    const vivid = s * (1 - Math.abs(2 * l - 1))
    return (0.15 + vivid) * Math.sqrt(p.share)
  }
  const base = picked[0]
  // A send bubble the same color as the image would disappear, so look past the base first.
  const candidates = picked.filter((p) => p.share >= 0.03 && p !== base && contrastRatio(p.color, base.color) >= 1.3)
  const seed = candidates.length ? candidates.reduce((best, p) => (score(p) > score(best) ? p : best)) : base
  return { colors: picked.map((p) => p.color), base: base.color, seed: seed.color, tone: lum / total < 0.3 ? 'dark' : 'light' }
}

/**
 * Applies a palette and clears per-element color overrides so every element follows it.
 * Uploaded images (backgrounds, image bubbles and their text color) are kept. In place.
 */
export function applyScheme(config: ThemeConfig, palette: PaletteSetting): void {
  config.palette = { ...palette }
  for (const fill of [config.background.main, config.background.chatroom, config.passcode.background]) {
    if (fill.mode === 'color') fill.mode = 'default'
  }
  for (const b of [config.bubbles.send, config.bubbles.receive]) {
    if (b.mode === 'image') continue
    b.mode = 'default'
    b.textColor = null
  }
  config.headerInput.mode = 'default'
  const pc = config.passcode
  pc.titleColor = pc.keypadTextColor = pc.keypadBackground = pc.pressedColor = null
  pc.bullets.emptyColor = pc.bullets.filledColor = null
}
