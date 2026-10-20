import { describe, expect, it } from 'vitest'
import { getRepositories } from '@/app/services'
import { createProjectFromPreset } from '@/features/projects/newTheme'
import { contrastRatio } from './color'
import { createDefaultConfig } from './defaults'
import { presetConfig, THEME_PRESETS } from './presets'
import { resolveTheme } from './resolve'

describe('theme presets', () => {
  it('have unique ids and names', () => {
    expect(new Set(THEME_PRESETS.map((p) => p.id)).size).toBe(THEME_PRESETS.length)
    expect(new Set(THEME_PRESETS.map((p) => p.name)).size).toBe(THEME_PRESETS.length)
  })

  it.each(THEME_PRESETS)('$name keeps text and bubbles readable', (preset) => {
    const theme = resolveTheme(presetConfig(preset))
    expect(contrastRatio(theme.palette.text, theme.palette.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(theme.palette.subText, theme.palette.background)).toBeGreaterThanOrEqual(3)
    for (const b of [theme.bubbles.send, theme.bubbles.receive]) expect(contrastRatio(b.textColor, b.color)).toBeGreaterThanOrEqual(4.5)
  })

  it('starts from the default config with the colors and bubble shape applied', () => {
    expect(presetConfig(THEME_PRESETS[0])).toEqual(createDefaultConfig())
    const mono = THEME_PRESETS.find((p) => p.id === 'mono')!
    const config = presetConfig(mono)
    expect(config.palette).toEqual(mono.palette)
    expect(config.bubbles.send.shape).toBe('square')
    expect(config.bubbles.receive.shape).toBe('square')
    expect(config.bubbles.send.mode).toBe('default')
  })

  it('creates a stored local project in the preset', async () => {
    const preset = THEME_PRESETS.find((p) => p.id === 'night')!
    const id = await createProjectFromPreset(preset)
    const project = (await getRepositories().projects.get(id))!
    expect(project.config.palette).toEqual(preset.palette)
    expect(project.cloudThemeId).toBeNull()
  })
})
