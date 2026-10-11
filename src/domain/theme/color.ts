import type { HexColor } from './types'

const HEX6 = /^#[0-9a-f]{6}$/
const HEX_ANY = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

export function isHexColor(value: unknown): value is HexColor {
  return typeof value === 'string' && HEX6.test(value)
}

/** Accepts `#abc`, `abc`, `#AABBCC`; returns `#aabbcc` or null. */
export function normalizeHex(input: string): HexColor | null {
  const trimmed = input.trim()
  const match = HEX_ANY.exec(trimmed)
  if (!match) return null
  let hex = match[1].toLowerCase()
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  return `#${hex}`
}

export function hexToRgb(hex: HexColor): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number): HexColor {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Linear mix: t=0 → a, t=1 → b. */
export function mix(a: HexColor, b: HexColor, t: number): HexColor {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}

export function relativeLuminance(hex: HexColor): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: HexColor, b: HexColor): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Prefer `preferred` when it is readable on `bg`, otherwise black/white. */
export function readableOn(bg: HexColor, preferred: HexColor, minRatio = 3): HexColor {
  if (contrastRatio(bg, preferred) >= minRatio) return preferred
  return relativeLuminance(bg) > 0.45 ? '#1e1e20' : '#ffffff'
}

export function isDark(hex: HexColor): boolean {
  return relativeLuminance(hex) < 0.2
}
