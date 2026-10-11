import { describe, expect, it } from 'vitest'
import { createDefaultConfig, createNewProject } from './defaults'
import { collectAssetIds, migrateConfig, normalizeConfig, UnsupportedSchemaError } from './normalize'
import { activeAssetIds, resolveTheme } from './resolve'

describe('normalizeConfig / migrateConfig', () => {
  it('repairs corrupted leaves with defaults and drops unknown keys', () => {
    const d = createDefaultConfig()
    const repaired = normalizeConfig({
      palette: { background: 'not-a-color', text: '#ABC', accent: 42 },
      bubbles: { send: { shape: 'triangle', radius: 999, mode: 'image', imageAssetId: 'blob:http://x/1' } },
      evil: { nested: true },
    })
    expect(repaired.palette.background).toBe(d.palette.background)
    expect(repaired.palette.text).toBe('#aabbcc')
    expect(repaired.palette.accent).toBe(d.palette.accent)
    expect(repaired.bubbles.send.shape).toBe('rounded')
    expect(repaired.bubbles.send.radius).toBe(20)
    // Object URLs are never accepted as persistent asset references.
    expect(repaired.bubbles.send.imageAssetId).toBeNull()
    expect('evil' in repaired).toBe(false)
  })

  it('is idempotent and JSON round-trips', () => {
    const c = createDefaultConfig()
    c.bubbles.send.mode = 'image'
    c.bubbles.send.imageAssetId = 'ast_abc123'
    const once = normalizeConfig(c)
    expect(normalizeConfig(JSON.parse(JSON.stringify(once)))).toEqual(once)
  })

  it('rejects schema versions newer than this build', () => {
    expect(() => migrateConfig({ schemaVersion: 99 })).toThrow(UnsupportedSchemaError)
    expect(migrateConfig({}).schemaVersion).toBe(1)
  })
})

describe('asset references', () => {
  it('keeps inactive images referenced so mode switches never destroy originals', () => {
    const c = createDefaultConfig()
    c.background.main = { mode: 'color', color: '#ff0000', imageAssetId: 'ast_keepme' }
    expect(collectAssetIds(c).has('ast_keepme')).toBe(true)
    // …but the exporter/preview do not use it while in color mode.
    expect(activeAssetIds(resolveTheme(c)).has('ast_keepme')).toBe(false)
  })
})

describe('resolveTheme', () => {
  it('default mode follows palette, color mode overrides', () => {
    const c = createDefaultConfig()
    c.palette.accent = '#123456'
    expect(resolveTheme(c).bubbles.send.color).toBe('#123456')
    c.bubbles.send.mode = 'color'
    c.bubbles.send.color = '#abcdef'
    expect(resolveTheme(c).bubbles.send.color).toBe('#abcdef')
  })

  it('image mode without an image falls back instead of producing a broken reference', () => {
    const c = createDefaultConfig()
    c.background.chatroom.mode = 'image'
    c.bubbles.receive.mode = 'image'
    const t = resolveTheme(c)
    expect(t.chatroom.background.imageAssetId).toBeNull()
    expect(t.bubbles.receive.kind).toBe('generated')
  })

  it('picks readable bubble text on dark bubbles', () => {
    const c = createDefaultConfig()
    c.bubbles.send.mode = 'color'
    c.bubbles.send.color = '#111111'
    expect(resolveTheme(c).bubbles.send.textColor).toBe('#ffffff')
  })

  it('uses image bullets only when all 8 images are present', () => {
    const c = createDefaultConfig()
    c.passcode.bullets.mode = 'image'
    c.passcode.bullets.normal = ['ast_a', 'ast_b', 'ast_c', 'ast_d']
    c.passcode.bullets.selected = ['ast_e', 'ast_f', 'ast_g', null]
    expect(resolveTheme(c).passcode.bullets.kind).toBe('generated')
    c.passcode.bullets.selected[3] = 'ast_h'
    expect(resolveTheme(c).passcode.bullets.kind).toBe('image')
  })
})

describe('createNewProject', () => {
  it('keeps local, cloud and export ids distinct', () => {
    const p = createNewProject()
    expect(p.id).toMatch(/^lp_/)
    expect(p.cloudThemeId).toBeNull()
    expect(p.exportThemeId).toMatch(/^KTS_[0-9a-z]{16}$/)
    expect(p.name).toBe('이름 없는 테마')
  })
})
