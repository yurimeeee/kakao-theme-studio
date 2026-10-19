import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { getRepositories } from '@/app/services'
import { createDefaultConfig } from '@/domain/theme/defaults'
import { resolveTheme } from '@/domain/theme/resolve'
import { importKthemeFile } from '@/features/projects/importKtheme'
import { fakePng } from '@/test/fakeRasterizer'
import { mapThemeArchive } from './mapTheme'
import { summarizePixels, type ImageProbe, type ImageSummary } from './probe'
import { KthemeImportError, readKthemeArchive } from './readArchive'

type Pixels = Partial<Pick<ImageSummary, 'solid' | 'cornerClear'>>

/** Fake PNG (IHDR size) carrying its pixel summary after the header, so tests need no Canvas. */
function png(width: number, height: number, pixels: Pixels = {}, tag = ''): Blob {
  return new Blob([fakePng(width, height), JSON.stringify({ ...pixels, tag })], { type: 'image/png' })
}

const fakeProbe: ImageProbe = async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer)
  const extra = JSON.parse(new TextDecoder().decode(bytes.slice(33)) || '{}') as Pixels
  return { width: view.getUint32(16), height: view.getUint32(20), solid: extra.solid ?? null, cornerClear: extra.cornerClear ?? 0 }
}

async function archive(css: string, images: Record<string, Blob>, prefix = '') {
  const zip = new JSZip()
  zip.file(`${prefix}KakaoTalkTheme.css`, '﻿' + css)
  for (const [name, blob] of Object.entries(images)) zip.file(`${prefix}Images/${name}`, new Uint8Array(await blob.arrayBuffer()))
  return new Blob([await zip.generateAsync({ type: 'uint8array' }) as BlobPart])
}

const REFERENCE_STYLE_CSS = `
/* comment */
ManifestStyle {
  -kakaotalk-theme-name: '봄 테마';
  -kakaotalk-theme-id: 'COL_spring';
  -kakaotalk-theme-version: '1.0';
}
TabBarStyle-Main {
  background-color: #FFF0F5;
  -ios-friends-normal-icon-image: 'tabFriends.png';
  -ios-friends-selected-icon-image: 'tabFriendsOn.png';
  -ios-openchats-normal-icon-image: 'tabOpen.png';
  -ios-find-normal-icon-image: 'tabFind.png';
}
HeaderStyle-Main { -ios-text-color: #331122; }
MainViewStyle-Primary {
  background-color: #fff0f5;
  -ios-background-image: 'mainBg.png';
  -ios-text-color: #331122;
  -ios-description-text-color: #996677;
}
BackgroundStyle-ChatRoom { background-color: #ffe4ec; -ios-background-image: 'roomBg.png'; }
InputBarStyle-Chat { -ios-send-normal-background-color: #ff8fab; }
MessageCellStyle-Send {
  -ios-background-image: 'bubSend01.png' 16px 39px;
  -ios-group-background-image: 'bubSend02.png' 16px 16.5px;
  -ios-title-edgeinsets: 29px 12px 8px 36px;
  -ios-group-title-edgeinsets: 9px 12px 8px 36px;
  -ios-text-color: #331122;
}
MessageCellStyle-Receive {
  -ios-background-image: 'bubRecv01.png' 17px 17px;
  -ios-group-background-image: 'bubRecv01.png' 17px 17px;
  -ios-title-edgeinsets: 9px 12px 9px 12px;
  -ios-text-color: #331122;
}
DefaultProfileStyle { -ios-profile-images: 'profile.png'; }
ButtonStyle-AddFriend { -ios-image: 'addFriend.png'; }
PasscodeStyle {
  -ios-bullet-first-image: 'dot.png';  -ios-bullet-second-image: 'dot.png';
  -ios-bullet-third-image: 'dot.png';  -ios-bullet-fourth-image: 'dot.png';
  -ios-bullet-selected-first-image: 'dotOn.png';  -ios-bullet-selected-second-image: 'dotOn.png';
  -ios-bullet-selected-third-image: 'dotOn.png';  -ios-bullet-selected-fourth-image: 'dotOn.png';
  -ios-keypad-number-highlighted-image: 'pressed.png';
}
`

const REFERENCE_IMAGES = {
  'mainBg@3x.png': png(1125, 2250, { solid: '#fff0f5' }),
  'roomBg@3x.png': png(1125, 2250, {}, 'art'),
  'bubSend01@3x.png': png(171, 159, {}, 'send1'),
  'bubSend02@3x.png': png(171, 120, {}, 'send2'),
  // 35pt rounded rect, r = 16pt → 14 clear px on the @3x diagonal.
  'bubRecv01@2x.png': png(70, 70, { solid: '#ffffff', cornerClear: 9 }),
  'bubRecv01@3x.png': png(105, 105, { solid: '#ffffff', cornerClear: 14 }),
  'tabFriends@3x.png': png(120, 120, {}, 'tf'),
  'tabFriendsOn@3x.png': png(120, 120, {}, 'tfo'),
  'tabOpen@2x.png': png(80, 80, {}, 'to'),
  'tabFind@3x.png': png(120, 120, {}, 'find'),
  'profile@3x.png': png(300, 300, {}, 'face'),
  'dot@3x.png': png(144, 144, { solid: '#eeeeee' }),
  'dotOn@3x.png': png(144, 144, { solid: '#ff8fab' }),
  'commonIcoTheme.png': png(200, 200, {}, 'icon'),
}

describe('mapThemeArchive', () => {
  it('maps a reference-style theme onto the editor model', async () => {
    const file = await archive(REFERENCE_STYLE_CSS, REFERENCE_IMAGES)
    const { name, config, images, notes } = await mapThemeArchive(await readKthemeArchive(file), fakeProbe)

    expect(name).toBe('봄 테마')
    expect(config.palette).toEqual({ background: '#fff0f5', text: '#331122', subText: '#996677', accent: '#ff8fab' })
    // Solid background image = the palette color → stays linked to 전체 색상.
    expect(config.background.main.mode).toBe('default')
    expect(config.background.chatroom).toMatchObject({ mode: 'image', color: '#ffe4ec' })
    expect(config.headerInput.mode).toBe('default')

    const send = config.bubbles.send
    expect(send.mode).toBe('image')
    expect(send.advanced).toMatchObject({ insets: { top: 29, left: 12, bottom: 8, right: 36 }, stretch: { x: 16, y: 39 }, imageSize: 100 })
    expect(send.advanced.groupImageAssetId).not.toBe(send.imageAssetId)
    expect(send.advanced.group).toMatchObject({ insets: { top: 9 }, stretch: { x: 16, y: 16.5 } })
    expect(send.textColor).toBeNull() // equals the derived text color

    // Solid square bubble with a centered stretch point → generated color bubble.
    const receive = config.bubbles.receive
    expect(receive).toMatchObject({ mode: 'color', color: '#ffffff', shape: 'rounded', radius: 16, imageAssetId: null })

    expect(config.tabs.mode).toBe('image')
    expect(config.tabs.barColor).toBe('#fff0f5')
    expect(config.tabs.icons.friends.normal).toBeTruthy()
    expect(config.tabs.icons.friends.selected).toBeTruthy()
    expect(config.tabs.icons.now).toMatchObject({ selected: null }) // from the legacy openchats key
    expect(config.tabs.icons.chats.normal).toBeNull()

    expect(config.profile.mode).toBe('image')
    expect(config.themeIcon.mode).toBe('image')
    expect(config.passcode.bullets).toMatchObject({ mode: 'default', emptyColor: '#eeeeee' })
    expect(resolveTheme(config).passcode.bullets).toMatchObject({ kind: 'generated', filledColor: '#ff8fab' })

    // Every referenced id has an image; identical files are stored once.
    const ids = new Set([send.imageAssetId, send.advanced.groupImageAssetId, config.background.chatroom.imageAssetId, config.profile.imageAssetId, config.themeIcon.imageAssetId])
    for (const id of ids) expect(images.has(id!)).toBe(true)
    expect(images.size).toBe(8)

    expect(notes.join('\n')).toMatch(/찾기 탭/)
    expect(notes.join('\n')).toMatch(/친구 추가 버튼/)
    expect(notes.join('\n')).toMatch(/pressed\.png/) // referenced but not in the archive
  })

  it('reads @2x-only bubbles at their real size and keeps file colors that differ from the palette', async () => {
    const css = `
      MainViewStyle-Primary { background-color: #ffffff; -ios-text-color: #222224; }
      HeaderStyle-Main { -ios-text-color: #ff0000; }
      MessageCellStyle-Send { -ios-background-image: 'b.png' 10px 12px; -ios-group-background-image: 'b.png' 10px 12px; -ios-text-color: #0000ff; }
      BackgroundStyle-Passcode { background-color: #101010; }
      LabelStyle-PasscodeTitle { -ios-text-color: #222224; }
    `
    const { config } = await mapThemeArchive(await readKthemeArchive(await archive(css, { 'b@2x.png': png(60, 50, {}, 'b') })), fakeProbe)
    expect(config.bubbles.send.advanced).toMatchObject({ imageSize: 150, stretch: { x: 10, y: 12 }, groupImageAssetId: null })
    expect(config.bubbles.send.textColor).toBe('#0000ff')
    expect(config.headerInput).toMatchObject({ mode: 'color', headerTextColor: '#ff0000', inputBackground: '#ffffff' })
    expect(config.passcode.background).toMatchObject({ mode: 'color', color: '#101010' })
    expect(config.passcode.titleColor).toBeNull()
  })

  it('leaves a default theme untouched when the file has nothing to say', async () => {
    const { config, images, notes } = await mapThemeArchive(await readKthemeArchive(await archive('ManifestStyle { -kakaotalk-theme-name: "x"; }', {})), fakeProbe)
    expect(config).toEqual(createDefaultConfig())
    expect(images.size).toBe(0)
    expect(notes).toEqual([])
  })
})

describe('readKthemeArchive', () => {
  it('finds the theme inside a wrapping folder and ignores Finder leftovers', async () => {
    const zip = new JSZip()
    zip.file('My Theme/KakaoTalkTheme.css', 'ManifestStyle { -kakaotalk-theme-name: \'a\'; }')
    zip.file('__MACOSX/My Theme/._KakaoTalkTheme.css', 'junk')
    zip.file('My Theme/Images/.DS_Store', 'junk')
    zip.file('My Theme/Images/bg@3x.png', new Uint8Array(await png(3, 3).arrayBuffer()))
    const read = await readKthemeArchive(new Blob([await zip.generateAsync({ type: 'uint8array' }) as BlobPart]))
    expect(read.css).toMatch(/ManifestStyle/)
    expect(await read.image('bg')).toMatchObject({ scale: 3 })
    expect(await read.image('BG')).toMatchObject({ scale: 3 })
    expect(await read.image('nope')).toBeNull()
  })

  it('rejects files that are not themes', async () => {
    await expect(readKthemeArchive(new Blob(['hello']))).rejects.toMatchObject({ code: 'not-archive' })
    const zip = new JSZip()
    zip.file('readme.txt', 'x')
    await expect(readKthemeArchive(new Blob([await zip.generateAsync({ type: 'uint8array' }) as BlobPart]))).rejects.toBeInstanceOf(KthemeImportError)
  })
})

describe('summarizePixels', () => {
  it('detects a solid fill under antialiased transparent corners', () => {
    const w = 10, h = 10
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) data.set([200, 100, 50, 255], i * 4)
    for (let d = 0; d < 3; d++) data.set([0, 0, 0, 0], (d * w + d) * 4)
    data.set([10, 10, 10, 120], (3 * w + 4) * 4) // half-transparent edge pixel is ignored
    expect(summarizePixels(data, w, h)).toEqual({ solid: '#c86432', cornerClear: 3 })
    data.set([201, 100, 50, 255], 50 * 4)
    expect(summarizePixels(data, w, h).solid).toBe('#c86432')
    data.set([0, 255, 0, 255], 60 * 4)
    expect(summarizePixels(data, w, h).solid).toBeNull()
  })
})

describe('importKthemeFile', () => {
  it('stores a new local project with its images and a fresh .ktheme id', async () => {
    const file = await archive(REFERENCE_STYLE_CSS, REFERENCE_IMAGES)
    const result = await importKthemeFile(file, fakeProbe)
    const { projects, assets } = getRepositories()
    const project = (await projects.get(result.projectId))!
    expect(project.name).toBe('봄 테마')
    expect(project.exportThemeId).not.toBe('COL_spring')
    expect(project.cloudThemeId).toBeNull()
    const stored = await assets.getMany([project.config.bubbles.send.imageAssetId!])
    expect([...stored.values()][0]).toMatchObject({ projectId: project.id, mime: 'image/png', width: 171, height: 159 })
  })
})
