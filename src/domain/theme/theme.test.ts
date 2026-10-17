import { describe, expect, it } from 'vitest'
import { createDefaultConfig, createNewProject, isElementDefault, resetElement } from './defaults'
import { collectAssetIds, mapAssetRefs, migrateConfig, normalizeConfig, normalizeOrigin, UnsupportedSchemaError } from './normalize'
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

describe('bubble image layout', () => {
  it('defaults old configs to 100% with no separate 연속 메시지 layout and clamps sizes', () => {
    const old = createDefaultConfig() as unknown as { bubbles: { send: { advanced: Record<string, unknown> } } }
    delete old.bubbles.send.advanced.imageSize
    delete old.bubbles.send.advanced.group
    const n = normalizeConfig(old)
    expect(n.bubbles.send.advanced).toMatchObject({ imageSize: 100, group: null })
    const c = createDefaultConfig()
    c.bubbles.send.advanced.imageSize = 9999
    c.bubbles.send.advanced.group = { insets: { top: 1, left: 2, bottom: 3, right: 4 }, stretch: { x: 1, y: 2 }, imageSize: 1 }
    const m = normalizeConfig(JSON.parse(JSON.stringify(c)))
    expect(m.bubbles.send.advanced.imageSize).toBe(300)
    expect(m.bubbles.send.advanced.group).toEqual({ insets: { top: 1, left: 2, bottom: 3, right: 4 }, stretch: { x: 1, y: 2 }, imageSize: 20 })
  })

  it('resolves 연속 메시지 layout only for a separate image', () => {
    const c = createDefaultConfig()
    const b = c.bubbles.receive
    b.mode = 'image'
    b.imageAssetId = 'ast_a'
    b.advanced.group = { insets: { top: 1, left: 1, bottom: 1, right: 1 }, stretch: null, imageSize: 50 }
    expect(resolveTheme(c).bubbles.receive.group.imageSize).toBe(100)
    b.advanced.groupImageAssetId = 'ast_b'
    expect(resolveTheme(c).bubbles.receive.group.imageSize).toBe(50)
    b.advanced.group = null
    expect(resolveTheme(c).bubbles.receive.group).toEqual({ insets: b.advanced.insets, stretch: null, imageSize: 100 })
  })
})

describe('theme icon', () => {
  it('round-trips through normalize and is active only in image mode', () => {
    const c = createDefaultConfig()
    expect(normalizeConfig({}).themeIcon).toEqual({ mode: 'default', imageAssetId: null })
    c.themeIcon = { mode: 'image', imageAssetId: 'ast_icon' }
    expect(normalizeConfig(JSON.parse(JSON.stringify(c))).themeIcon).toEqual(c.themeIcon)
    expect(resolveTheme(c).themeIconAssetId).toBe('ast_icon')
    expect(activeAssetIds(resolveTheme(c)).has('ast_icon')).toBe(true)
    c.themeIcon.mode = 'default'
    expect(resolveTheme(c).themeIconAssetId).toBeNull()
    expect(collectAssetIds(c).has('ast_icon')).toBe(true)
    expect(mapAssetRefs(c, () => null).themeIcon.imageAssetId).toBeNull()
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

describe('normalizeOrigin', () => {
  const shareId = 'abcdefghijkABCDEFGHJK2'

  it('keeps a valid 복제 credit and trims long text', () => {
    expect(normalizeOrigin({ shareId, name: '원본', ownerName: '제작자' })).toEqual({ shareId, name: '원본', ownerName: '제작자' })
    expect(normalizeOrigin({ shareId, name: '가'.repeat(50), ownerName: '나'.repeat(50) })).toMatchObject({ name: '가'.repeat(30), ownerName: '나'.repeat(40) })
  })

  it('reads missing or malformed data as no origin', () => {
    for (const bad of [undefined, null, 'x', { shareId: '../etc', name: 'a', ownerName: 'b' }, { shareId, name: 1, ownerName: 'b' }]) {
      expect(normalizeOrigin(bad)).toBeNull()
    }
    expect(createNewProject().origin).toBeNull()
  })
})

describe('resetElement', () => {
  it('resets only the chosen element, and isElementDefault follows', () => {
    const config = createDefaultConfig()
    config.bubbles.send = { ...config.bubbles.send, mode: 'image', imageAssetId: 'ast_a', radius: 3 }
    config.palette.accent = '#ff0000'
    expect(isElementDefault(config, 'bubbleSend')).toBe(false)
    expect(isElementDefault(config, 'bubbleReceive')).toBe(true)

    resetElement(config, 'bubbleSend')
    expect(config.bubbles.send).toEqual(createDefaultConfig().bubbles.send)
    expect(config.palette.accent).toBe('#ff0000')
    expect(isElementDefault(config, 'bubbleSend')).toBe(true)
    expect(isElementDefault(config, 'palette')).toBe(false)
  })

  it('ignores key order of stored configs', () => {
    const config = createDefaultConfig()
    const { accent, text, subText, background } = config.palette
    config.palette = { accent, text, subText, background }
    expect(isElementDefault(config, 'palette')).toBe(true)
  })
})
