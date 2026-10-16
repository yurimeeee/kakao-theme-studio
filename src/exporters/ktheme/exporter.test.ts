import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { contrastRatio, mix } from '@/domain/theme/color'
import { createDefaultConfig } from '@/domain/theme/defaults'
import type { HexColor, ThemeConfig } from '@/domain/theme/types'
import { FakeRasterizer, fakePng } from '@/test/fakeRasterizer'
import { fitBubbleImage, flatLines, generatedBubbleGeometry, imageBubbleGeometry, isFlatSlot, rescaleLayout, type Pixels } from './bubbleGeometry'
import { buildThemePackage, ExportError, type ExportSnapshot } from './buildPackage'
import { cssString, parseThemeCss, referencedImages } from './css'
import { createKthemeArchive, toKthemeFileName } from './exportTheme'
import { validatePackage } from './validate'

function snapshot(config: ThemeConfig = createDefaultConfig(), assets: [string, Blob][] = []): ExportSnapshot {
  return { name: '나의 테마', exportThemeId: 'KTS_abcdefghijklmnop', revision: 3, config, assets: new Map(assets) }
}

async function unzip(blob: Blob) {
  return JSZip.loadAsync(new Uint8Array(await blob.arrayBuffer()))
}

/** @3x bubble: transparent margin, 2px border, flat fill, a decoration hanging over the top edge. */
function fitPixels(): Pixels {
  const w = 150, h = 120
  const data = new Uint8ClampedArray(w * h * 4)
  const put = (x: number, y: number, c: [number, number, number, number]) => data.set(c, (y * w + x) * 4)
  for (let y = 30; y < 114; y++)
    for (let x = 6; x < 144; x++) {
      const edge = y < 32 || y > 111 || x < 8 || x > 141
      put(x, y, edge ? [80, 50, 40, 255] : [248, 213, 218, 255])
    }
  for (let y = 10; y < 45; y++) for (let x = 100; x < 130; x++) put(x, y, [255, 255, 255, 255]) // decoration
  return { width: w, height: h, data }
}

describe('createKthemeArchive', () => {
  it('produces a validated archive for a color-only theme', async () => {
    const archive = await createKthemeArchive(snapshot(), new FakeRasterizer())
    expect(archive.fileName).toBe('나의 테마.ktheme')
    const zip = await unzip(archive.blob)
    const names = Object.keys(zip.files)
    expect(names[0]).toBe('KakaoTalkTheme.css')
    expect(names).toContain('Images/')
    expect(names.some((n) => n.includes('__MACOSX') || n.includes('.DS_Store'))).toBe(false)

    const raw = await zip.file('KakaoTalkTheme.css')!.async('uint8array')
    expect([...raw.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]) // UTF-8 BOM like the reference
    const css = new TextDecoder().decode(raw)
    const manifest = parseThemeCss(css).get('ManifestStyle')!
    expect(manifest.get('-kakaotalk-theme-name')).toBe("'나의 테마'")
    expect(manifest.get('-kakaotalk-theme-id')).toBe("'KTS_abcdefghijklmnop'")
    expect(manifest.get('-kakaotalk-theme-version')).toBe("'1.0.3'")

    // Every referenced image exists at @2x and @3x.
    for (const base of referencedImages(css)) {
      expect(zip.file(`Images/${base}@2x.png`), base).not.toBeNull()
      expect(zip.file(`Images/${base}@3x.png`), base).not.toBeNull()
    }
    // Color-only themes still get generated bubbles, profile and passcode resources.
    for (const base of ['chatroomBubbleSend01', 'chatroomBubbleReceive02Selected', 'profileImg01', 'passcodeImgCode04Selected', 'passcodeKeypadPressed']) {
      expect(referencedImages(css).has(base), base).toBe(true)
    }
    expect(zip.file('Images/commonIcoTheme.png')).not.toBeNull()
    // No web CSS leaks into the theme file.
    expect(css).not.toMatch(/border-radius/)
    // Tabs without uploaded icons keep the app default (no guessed file names).
    expect(css).not.toMatch(/-ios-(friends|chats|more)-normal-icon-image/)
    expect(css).not.toMatch(/\{\s*\}/) // no empty blocks
  })

  it('maps uploaded images, tab icons and image bubbles with correct sizes and stretch', async () => {
    const config = createDefaultConfig()
    config.background.chatroom = { mode: 'image', color: '#000000', imageAssetId: 'ast_bg' }
    config.bubbles.send = { ...config.bubbles.send, mode: 'image', imageAssetId: 'ast_bub', advanced: { ...config.bubbles.send.advanced, stretch: { x: 20, y: 15 } } }
    config.tabs.mode = 'image'
    config.tabs.icons.friends = { normal: 'ast_tab', selected: null }
    const archive = await createKthemeArchive(
      snapshot(config, [
        ['ast_bg', fakePng(2000, 3000)],
        ['ast_bub', fakePng(150, 120)],
        ['ast_tab', fakePng(90, 90)],
      ]),
      new FakeRasterizer(),
    )
    const zip = await unzip(archive.blob)
    const css = await zip.file('KakaoTalkTheme.css')!.async('string')
    const send = parseThemeCss(css).get('MessageCellStyle-Send')!
    expect(send.get('-ios-background-image')).toBe("'chatroomBubbleSend01.png' 20px 15px")
    const tab = parseThemeCss(css).get('TabBarStyle-Main')!
    expect(tab.get('-ios-friends-normal-icon-image')).toBe("'maintabIcoFriends.png'")
    expect(tab.get('-ios-friends-selected-icon-image')).toBe("'maintabIcoFriendsSelected.png'")
    expect(tab.has('-ios-chats-normal-icon-image')).toBe(false)
  })

  it('sizes image bubbles by display size and gives 연속 메시지 its own layout', async () => {
    const config = createDefaultConfig()
    const send = config.bubbles.send
    send.mode = 'image'
    send.imageAssetId = 'ast_main'
    send.advanced = {
      ...send.advanced,
      imageSize: 50,
      stretch: { x: 10, y: 8 },
      insets: { top: 4, left: 5, bottom: 6, right: 7 },
      groupImageAssetId: 'ast_group',
      group: { stretch: { x: 3, y: 2.5 }, insets: { top: 1, left: 2, bottom: 3, right: 4 }, imageSize: 100 },
    }
    const raster = new FakeRasterizer()
    const pkg = await buildThemePackage(snapshot(config, [['ast_main', fakePng(150, 120)], ['ast_group', fakePng(60, 45)]]), raster)
    // 150×120px at 50% = 25×20pt → @3x 75×60; group at 100% = 20×15pt → @3x 60×45.
    expect(raster.surfaces).toContainEqual({ width: 75, height: 60 })
    expect(raster.surfaces).toContainEqual({ width: 60, height: 45 })
    const block = parseThemeCss(pkg.css).get('MessageCellStyle-Send')!
    expect(block.get('-ios-background-image')).toBe("'chatroomBubbleSend01.png' 10px 8px")
    expect(block.get('-ios-group-background-image')).toBe("'chatroomBubbleSend02.png' 3px 2.5px")
    expect(block.get('-ios-title-edgeinsets')).toMatch(/^4px 5px 6px 7px/)
    expect(block.get('-ios-group-title-edgeinsets')).toBe('1px 2px 3px 4px')
    expect(await validatePackage(pkg.files)).toEqual([])

    // Without a separate image the group layout is ignored: 02 repeats the first message.
    send.advanced.groupImageAssetId = null
    const same = parseThemeCss((await buildThemePackage(snapshot(config, [['ast_main', fakePng(150, 120)]]), new FakeRasterizer())).css).get('MessageCellStyle-Send')!
    expect(same.get('-ios-group-background-image')).toBe("'chatroomBubbleSend02.png' 10px 8px")
    expect(same.get('-ios-group-title-edgeinsets')).toBe('4px 5px 6px 7px')
  })

  it('writes the 지금 tab to now + openchats and the shopping tab to shopping', async () => {
    const config = createDefaultConfig()
    config.tabs.mode = 'image'
    config.tabs.icons.now = { normal: 'ast_now', selected: null }
    config.tabs.icons.shopping = { normal: 'ast_shop', selected: 'ast_now' }
    const archive = await createKthemeArchive(
      snapshot(config, [['ast_now', fakePng(90, 90)], ['ast_shop', fakePng(90, 90)]]),
      new FakeRasterizer(),
    )
    const zip = await unzip(archive.blob)
    const tab = parseThemeCss(await zip.file('KakaoTalkTheme.css')!.async('string')).get('TabBarStyle-Main')!
    expect(tab.get('-ios-now-normal-icon-image')).toBe("'maintabIcoNow.png'")
    expect(tab.get('-ios-openchats-normal-icon-image')).toBe("'maintabIcoNow.png'")
    expect(tab.get('-ios-openchats-selected-icon-image')).toBe("'maintabIcoNowSelected.png'")
    expect(tab.get('-ios-shopping-selected-icon-image')).toBe("'maintabIcoShoppingSelected.png'")
    expect(tab.has('-ios-friends-normal-icon-image')).toBe(false)
    for (const base of ['maintabIcoNow', 'maintabIcoNowSelected', 'maintabIcoShopping', 'maintabIcoShoppingSelected']) {
      expect(zip.file(`Images/${base}@3x.png`), base).not.toBeNull()
    }
  })

  it('derives the input bar menu button colors from the bar and keeps its text readable', async () => {
    const config = createDefaultConfig()
    config.headerInput = { ...config.headerInput, mode: 'color', inputBackground: '#1c1c1e', buttonColor: '#d0d0d0' }
    const zip = await unzip((await createKthemeArchive(snapshot(config), new FakeRasterizer())).blob)
    const bar = parseThemeCss(await zip.file('KakaoTalkTheme.css')!.async('string')).get('InputBarStyle-Chat')!
    const menu = bar.get('-ios-button-normal-background-color') as HexColor
    expect(menu).toBe(mix('#1c1c1e', '#d0d0d0', 0.06))
    expect(contrastRatio(menu, bar.get('-ios-button-text-color') as HexColor)).toBeGreaterThanOrEqual(4.5)
    expect(bar.get('-ios-button-normal-background-alpha')).toBe('1.0')
  })

  it('uses an uploaded theme icon for commonIcoTheme.png instead of the drawn one', async () => {
    const icon = fakePng(512, 400)
    const bg = fakePng(2000, 3000)
    const raster = new FakeRasterizer()
    const decoded: Blob[] = []
    const decode = raster.decode.bind(raster)
    raster.decode = (blob) => (decoded.push(blob), decode(blob))
    const config = createDefaultConfig()
    config.background.chatroom = { mode: 'image', color: '#000000', imageAssetId: 'ast_bg' }
    config.themeIcon = { mode: 'image', imageAssetId: 'ast_icon' }
    const archive = await createKthemeArchive(snapshot(config, [['ast_icon', icon], ['ast_bg', bg]]), raster)
    const zip = await unzip(archive.blob)
    expect(zip.file('Images/commonIcoTheme.png')).not.toBeNull()
    expect(decoded).toContain(icon)
    expect(raster.surfaces).toContainEqual({ width: 200, height: 200 })

    // Default mode keeps the uploaded icon referenced but does not use it.
    config.themeIcon.mode = 'default'
    decoded.length = 0
    await createKthemeArchive(snapshot(config, [['ast_icon', icon], ['ast_bg', bg]]), raster)
    expect(decoded).not.toContain(icon)
  })

  it('fails with missing-asset instead of exporting a broken reference', async () => {
    const config = createDefaultConfig()
    config.profile = { mode: 'image', imageAssetId: 'ast_gone' }
    await expect(createKthemeArchive(snapshot(config), new FakeRasterizer())).rejects.toMatchObject({ code: 'missing-asset' })
  })

  it('fails with decode-failed for undecodable images', async () => {
    const bad = fakePng(10, 10)
    const raster = new FakeRasterizer()
    raster.failDecode.add(bad)
    const config = createDefaultConfig()
    config.background.main = { mode: 'image', color: '#ffffff', imageAssetId: 'ast_bad' }
    await expect(createKthemeArchive(snapshot(config, [['ast_bad', bad]]), raster)).rejects.toBeInstanceOf(ExportError)
  })
})

describe('validatePackage', () => {
  it('detects missing scale, orphan files, unsafe entries and bad manifest', async () => {
    const pkg = await buildThemePackage(snapshot(), new FakeRasterizer())
    const files = new Map(pkg.files)
    files.delete('Images/profileImg01@2x.png')
    files.set('Images/strayImage@3x.png', fakePng(3, 3))
    files.set('__MACOSX/._KakaoTalkTheme.css', new Blob(['x']))
    const codes = (await validatePackage(files)).map((i) => i.code)
    expect(codes).toContain('missing-image')
    expect(codes).toContain('orphan-image')
    expect(codes).toContain('unsafe-path')

    const noName = new Map(pkg.files)
    noName.set('KakaoTalkTheme.css', new Blob([pkg.css.replace(/-kakaotalk-theme-id: '[^']*'/, "-kakaotalk-theme-id: ''")]))
    expect((await validatePackage(noName)).map((i) => i.code)).toContain('missing-manifest-field')
  })

  it('encodes PNGs concurrently but keeps archive order deterministic and every file filled', async () => {
    class SlowRasterizer extends FakeRasterizer {
      active = 0
      peak = 0
      n = 0
      surface(width: number, height: number) {
        const s = super.surface(width, height)
        const delay = (this.n++ * 7) % 5 // out-of-order completion
        return {
          ...s,
          toPng: async () => {
            this.active++
            this.peak = Math.max(this.peak, this.active)
            await new Promise((r) => setTimeout(r, delay))
            this.active--
            return s.toPng()
          },
        }
      }
    }
    const slow = new SlowRasterizer()
    const a = await buildThemePackage(snapshot(), slow)
    const b = await buildThemePackage(snapshot(), new FakeRasterizer())
    expect([...a.files.keys()]).toEqual([...b.files.keys()])
    expect([...a.files.values()].every((f) => f.size > 0)).toBe(true)
    expect(slow.peak).toBeGreaterThan(1)
    expect(slow.peak).toBeLessThanOrEqual(4)
  })

  it('fails the export when a PNG encode fails', async () => {
    class FailingRasterizer extends FakeRasterizer {
      surface(width: number, height: number) {
        const s = super.surface(width, height)
        return this.surfaces.length === 5 ? { ...s, toPng: () => Promise.reject(new Error('encode failed')) } : s
      }
    }
    await expect(buildThemePackage(snapshot(), new FailingRasterizer())).rejects.toThrow('encode failed')
  })

  it('detects @2x/@3x size mismatch', async () => {
    const pkg = await buildThemePackage(snapshot(), new FakeRasterizer())
    const files = new Map(pkg.files)
    files.set('Images/profileImg01@2x.png', fakePng(10, 10))
    expect((await validatePackage(files)).map((i) => i.code)).toContain('scale-mismatch')
  })

  it('accepts the generated package as-is', async () => {
    const pkg = await buildThemePackage(snapshot(), new FakeRasterizer())
    expect(await validatePackage(pkg.files)).toEqual([])
  })
})

describe('bubble geometry', () => {
  it('generated bubbles put the stretch point inside a symmetric cap', () => {
    expect(generatedBubbleGeometry({ shape: 'rounded', radius: 16 })).toEqual({ widthPt: 33, heightPt: 33, radiusPt: 16, stretch: { x: 16, y: 16 } })
    expect(generatedBubbleGeometry({ shape: 'square', radius: 16 }).radiusPt).toBe(0)
    expect(generatedBubbleGeometry({ shape: 'capsule', radius: 2 }).radiusPt).toBe(17)
  })

  it('clamps a user stretch point inside the @3x image', () => {
    expect(imageBubbleGeometry(150, 120, { x: 999, y: -5 }).stretch).toEqual({ x: 49, y: 0 })
    expect(imageBubbleGeometry(150, 120, null).stretch).toEqual({ x: 25, y: 20 })
  })

  it('scales the whole image with the display size', () => {
    expect(imageBubbleGeometry(150, 120, null, 50)).toMatchObject({ widthPt: 25, heightPt: 20 })
    expect(imageBubbleGeometry(150, 120, null, 200)).toMatchObject({ widthPt: 100, heightPt: 80 })
  })

  it('keeps stretch point and insets on the same image spot when resized', () => {
    const layout = { insets: { top: 10, left: 7, bottom: 9, right: 12 }, stretch: { x: 16, y: 13 }, imageSize: 100 }
    expect(rescaleLayout(layout, 100, 50)).toEqual({ ...layout, insets: { top: 5, left: 3.5, bottom: 4.5, right: 6 }, stretch: { x: 8, y: 6.5 } })
    expect(rescaleLayout({ ...layout, stretch: null }, 100, 200).stretch).toBeNull()
  })

  it('flags a stretch slot that crosses a decoration', () => {
    const { rows, cols } = flatLines(fitPixels())
    // Rows 50..110 are plain fill; a slot crossing the top border (px 31 → 32) is not.
    expect(isFlatSlot(rows, 25, 3)).toBe(true) // px 75..77
    expect(isFlatSlot(rows, 10, 3)).toBe(false) // px 30..32, border edge
    expect(isFlatSlot(cols, 10, 3)).toBe(true) // px 30..32, left of the decoration
    expect(isFlatSlot(cols, 33, 3)).toBe(false) // px 99..101, decoration edge at 100
    expect(isFlatSlot(rows, 75, 1)).toBe(true) // 300% size: 1 px slot
  })
})

describe('names', () => {
  it('sanitizes download names but keeps Korean', () => {
    expect(toKthemeFileName('  봄/여름:테마*  ')).toBe('봄여름테마.ktheme')
    expect(toKthemeFileName('...')).toBe('이름 없는 테마.ktheme')
  })

  it('escapes CSS string content', () => {
    expect(cssString("it's */ \"bad\"\n테마")).toBe('its  bad테마')
  })
})

describe('reference inventory guard', () => {
  it('emits only selectors and properties observed in the reference archive', async () => {
    const { REFERENCE_CSS_INVENTORY } = await import('./referenceInventory')
    const config = createDefaultConfig()
    config.tabs.mode = 'image'
    config.tabs.barColor = '#eeeeee'
    for (const k of ['friends', 'chats', 'now', 'shopping', 'more'] as const) config.tabs.icons[k] = { normal: 'ast_t', selected: 'ast_t' }
    const pkg = await buildThemePackage(snapshot(config, [['ast_t', fakePng(60, 60)]]), new FakeRasterizer())
    for (const [selector, props] of parseThemeCss(pkg.css)) {
      expect(REFERENCE_CSS_INVENTORY[selector], selector).toBeDefined()
      for (const prop of props.keys()) expect(REFERENCE_CSS_INVENTORY[selector], `${selector} ${prop}`).toContain(prop)
    }
  })
})

describe('fitBubbleImage', () => {
  const decorated = fitPixels

  it('puts the stretch point in a flat band and keeps text below decorations', () => {
    const fit = fitBubbleImage(decorated())!
    expect(fit).not.toBeNull()
    // Stretch column avoids the decoration (x 100..129 px → 33..43 pt), stretch row is below it.
    expect(fit.stretch.x * 3 + 2).toBeLessThan(100)
    expect(fit.stretch.y * 3).toBeGreaterThanOrEqual(45)
    // Body inner edges: top 32px, left 8px, bottom gap 8px, right gap 8px; text starts below the decoration.
    expect(fit.insets.top * 3).toBeGreaterThanOrEqual(45)
    expect(fit.insets).toMatchObject({ left: 9, bottom: 10, right: 9 })
  })

  it('returns null when nothing can be stretched safely', () => {
    const w = 20, h = 20
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) data.set([(i * 37) % 256, (i * 11) % 256, i % 256, 255], i * 4)
    expect(fitBubbleImage({ width: w, height: h, data })).toBeNull()
  })
})
