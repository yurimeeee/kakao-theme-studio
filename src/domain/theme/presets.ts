import { createDefaultConfig } from './defaults'
import { applyScheme, schemeFromSeed } from './scheme'
import type { BubbleSetting, PaletteSetting, ThemeConfig } from './types'

/**
 * 시작 템플릿: ready-made 전체 색상 combinations. Most come from one seed through the same
 * schemeFromSeed as 색 하나로 만들기 (so text stays readable); the mono ones are hand-picked.
 * A preset sets colors and bubble shape only; it never carries images.
 */
export interface ThemePreset {
  id: string
  name: string
  palette: PaletteSetting
  bubble?: Pick<BubbleSetting, 'shape' | 'radius'>
}

const DEFAULT_PALETTE = createDefaultConfig().palette

export const THEME_PRESETS: readonly ThemePreset[] = [
  { id: 'basic', name: '기본', palette: DEFAULT_PALETTE },
  { id: 'kakao', name: '노랑', palette: schemeFromSeed('#fee500', 'light') },
  { id: 'pink', name: '파스텔 핑크', palette: schemeFromSeed('#f9a8d4', 'light'), bubble: { shape: 'rounded', radius: 20 } },
  { id: 'mint', name: '파스텔 민트', palette: schemeFromSeed('#86efac', 'light'), bubble: { shape: 'rounded', radius: 20 } },
  { id: 'lavender', name: '라벤더', palette: schemeFromSeed('#c4b5fd', 'light'), bubble: { shape: 'rounded', radius: 20 } },
  { id: 'night', name: '밤하늘', palette: schemeFromSeed('#60a5fa', 'dark') },
  { id: 'plum', name: '다크 퍼플', palette: schemeFromSeed('#a78bfa', 'dark') },
  { id: 'mono', name: '모노', palette: { background: '#ffffff', text: '#111111', subText: '#6b6b70', accent: '#111111' }, bubble: { shape: 'square', radius: 0 } },
  { id: 'mono-dark', name: '모노 다크', palette: { background: '#121212', text: '#f2f2f2', subText: '#9a9aa0', accent: '#f2f2f2' }, bubble: { shape: 'square', radius: 0 } },
]

/** A fresh config in the preset's colors and bubble shape. */
export function presetConfig(preset: ThemePreset): ThemeConfig {
  const config = createDefaultConfig()
  applyScheme(config, preset.palette)
  if (preset.bubble) {
    for (const b of [config.bubbles.send, config.bubbles.receive]) Object.assign(b, preset.bubble)
  }
  return config
}
