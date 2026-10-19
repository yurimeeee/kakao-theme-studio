import { mix } from '@/domain/theme/color'
import { defaultProfileColors, resolveTheme, type ResolvedBubble, type ResolvedFill } from '@/domain/theme/resolve'
import { TAB_KEYS, type AssetId, type ThemeConfig } from '@/domain/theme/types'
import { generatedBubbleGeometry, imageBubbleGeometry } from './bubbleGeometry'
import {
  CSS_FILE_NAME,
  IMAGES_DIR,
  RESOURCES,
  SCALES,
  SELECTED_DARKEN,
  TAB_CSS_KEYS,
  TAB_FILE_KEYS,
  THEME_ICON_FILE,
  THEME_ICON_PX,
  type Scale,
} from './catalog'
import { serializeThemeCss, type BubbleCss, type ThemeCssModel } from './css'
import {
  darkenDrawn,
  drawCircle,
  drawContain,
  drawCover,
  drawDefaultProfile,
  drawRoundedRect,
  drawScaled,
  drawThemeIcon,
  fillSolid,
} from './draw'
import type { Decoded, Rasterizer, Surface } from './raster'

/** Immutable input taken at the moment 내보내기 is confirmed. */
export interface ExportSnapshot {
  name: string
  exportThemeId: string
  revision: number
  config: ThemeConfig
  assets: ReadonlyMap<AssetId, Blob>
}

export interface ThemePackage {
  /** archive path → content */
  files: Map<string, Blob>
  css: string
}

export class ExportError extends Error {
  readonly code: 'missing-asset' | 'decode-failed' | 'invalid-package' | 'render-failed'
  readonly details: string[]

  constructor(code: ExportError['code'], message: string, details: string[] = []) {
    super(message)
    this.code = code
    this.details = details
    this.name = 'ExportError'
  }
}

/** Parallel PNG encodes during export. */
const MAX_PENDING_ENCODES = 4
const EMPTY_PNG_SLOT = new Blob([], { type: 'image/png' })

export const imagePath = (base: string, scale: Scale) => `${IMAGES_DIR}/${base}@${scale}x.png`
export const CSS_BOM = '﻿'

export async function buildThemePackage(snapshot: ExportSnapshot, raster: Rasterizer): Promise<ThemePackage> {
  const theme = resolveTheme(snapshot.config)
  const files = new Map<string, Blob>()
  const decoded = new Map<AssetId, Decoded>()

  // PNG encoding is async (often off the main thread), so it overlaps with drawing the next
  // image. Only a few surfaces stay alive at once to bound canvas memory (iOS Safari limits it).
  const encodes: Promise<void>[] = []
  const inFlight = new Set<Promise<void>>()
  const encode = async (path: string, surface: Surface) => {
    files.set(path, EMPTY_PNG_SLOT) // reserve the slot so archive order stays deterministic
    while (inFlight.size >= MAX_PENDING_ENCODES) await Promise.race(inFlight)
    const job = surface.toPng().then((png) => void files.set(path, png))
    // Failures surface through `encodes`; the throttle only needs to know a slot is free.
    const tracked: Promise<void> = job.catch(() => undefined).finally(() => inFlight.delete(tracked))
    inFlight.add(tracked)
    encodes.push(job)
  }

  const decode = async (id: AssetId): Promise<Decoded> => {
    const hit = decoded.get(id)
    if (hit) return hit
    const blob = snapshot.assets.get(id)
    if (!blob) throw new ExportError('missing-asset', `Asset ${id} is missing`, [id])
    try {
      const d = await raster.decode(blob)
      decoded.set(id, d)
      return d
    } catch {
      throw new ExportError('decode-failed', `Asset ${id} could not be decoded`, [id])
    }
  }

  /** Renders `base` at every scale. `draw` receives the surface px size and the scale. */
  const emit = async (
    base: string,
    sizePt: { w: number; h: number },
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number, scale: Scale) => void | Promise<void>,
  ) => {
    for (const scale of SCALES) {
      const s = raster.surface(sizePt.w * scale, sizePt.h * scale)
      await draw(s.ctx, s.width, s.height, scale)
      await encode(imagePath(base, scale), s)
    }
  }

  const fillBackground = async (base: string, sizePt: { w: number; h: number }, fill: ResolvedFill) => {
    const image = fill.imageAssetId ? await decode(fill.imageAssetId) : null
    await emit(base, sizePt, (ctx, w, h) => {
      fillSolid(ctx, w, h, fill.color)
      if (image) drawCover(ctx, image, w, h, fill.focus)
    })
  }

  try {
    // Backgrounds are always emitted (solid color when no image) so the theme does
    // not depend on whether the app honours background-color alone.
    await fillBackground(RESOURCES.mainBackground.base, RESOURCES.mainBackground.sizePt, theme.main.background)
    await fillBackground(RESOURCES.chatroomBackground.base, RESOURCES.chatroomBackground.sizePt, theme.chatroom.background)
    await fillBackground(RESOURCES.passcodeBackground.base, RESOURCES.passcodeBackground.sizePt, theme.passcode.background)

    let tabBarImage: string | null = null
    if (theme.tabs.barColor) {
      tabBarImage = RESOURCES.tabBarBackground.base
      const color = theme.tabs.barColor
      await emit(tabBarImage, RESOURCES.tabBarBackground.sizePt, (ctx, w, h) => fillSolid(ctx, w, h, color))
    }

    const send = await emitBubble(RESOURCES.bubbleSend.base, theme.bubbles.send)
    const receive = await emitBubble(RESOURCES.bubbleReceive.base, theme.bubbles.receive)

    // Default profile (shown for friends without a photo).
    const profileId = theme.profileImageAssetId
    const profileImage = profileId ? await decode(profileId) : null
    const { bg: profileBg, fg: profileFg } = defaultProfileColors(theme.palette)
    await emit(RESOURCES.profile.base, RESOURCES.profile.sizePt, (ctx, w, h) => {
      if (profileImage) {
        fillSolid(ctx, w, h, profileBg)
        drawCover(ctx, profileImage, w, h, theme.profileFocus)
      } else drawDefaultProfile(ctx, w, profileBg, profileFg)
    })

    // Tab icons: only tabs with uploaded images; others keep the app default.
    const tabIcons: ThemeCssModel['tabBar']['icons'] = []
    for (const key of TAB_KEYS) {
      const pair = theme.tabs.icons[key]
      if (!pair) continue
      const normalBase = `${RESOURCES.tabIcon.base}${TAB_FILE_KEYS[key]}`
      const selectedBase = `${normalBase}Selected`
      const normal = await decode(pair.normal)
      const selected = await decode(pair.selected)
      await emit(normalBase, RESOURCES.tabIcon.sizePt, (ctx, w, h) => drawContain(ctx, normal, w, h))
      await emit(selectedBase, RESOURCES.tabIcon.sizePt, (ctx, w, h) => drawContain(ctx, selected, w, h))
      for (const cssKey of TAB_CSS_KEYS[key]) tabIcons.push({ cssKey, normal: normalBase, selected: selectedBase })
    }

    // Passcode bullets (4 normal + 4 selected) and pressed key.
    const bullets: string[] = []
    const selectedBullets: string[] = []
    const bulletSpec = RESOURCES.passcodeBullet
    for (let i = 0; i < 4; i++) {
      const base = `${bulletSpec.base}0${i + 1}`
      const selBase = `${base}Selected`
      const b = theme.passcode.bullets
      if (b.kind === 'image') {
        const n = await decode(b.normal[i])
        const s = await decode(b.selected[i])
        await emit(base, bulletSpec.sizePt, (ctx, w, h) => drawContain(ctx, n, w, h))
        await emit(selBase, bulletSpec.sizePt, (ctx, w, h) => drawContain(ctx, s, w, h))
      } else {
        await emit(base, bulletSpec.sizePt, (ctx, w, _h, scale) => drawCircle(ctx, w, 16 * scale, b.emptyColor))
        await emit(selBase, bulletSpec.sizePt, (ctx, w, _h, scale) => drawCircle(ctx, w, 16 * scale, b.filledColor))
      }
      bullets.push(base)
      selectedBullets.push(selBase)
    }
    const pressed = theme.passcode.pressed
    await emit(RESOURCES.passcodeKeypadPressed.base, RESOURCES.passcodeKeypadPressed.sizePt, (ctx, w) =>
      drawCircle(ctx, w, w, pressed),
    )

    // Theme list icon (no scale suffix, same as reference).
    const icon = raster.surface(THEME_ICON_PX, THEME_ICON_PX)
    const customIcon = theme.themeIconAssetId ? await decode(theme.themeIconAssetId) : null
    const iconBg = !customIcon && theme.chatroom.background.imageAssetId ? await decode(theme.chatroom.background.imageAssetId) : null
    drawThemeIcon(icon.ctx, THEME_ICON_PX, {
      background: theme.chatroom.background.color,
      receive: theme.bubbles.receive.color,
      send: theme.bubbles.send.color,
    }, iconBg, customIcon, theme.chatroom.background.focus)
    await encode(`${IMAGES_DIR}/${THEME_ICON_FILE}`, icon)

    const model: ThemeCssModel = {
      manifest: {
        name: snapshot.name,
        version: `1.0.${snapshot.revision}`,
        url: '',
        author: 'Kakao Theme Studio',
        id: snapshot.exportThemeId,
      },
      tabBar: { backgroundColor: theme.tabs.barColor, backgroundImage: tabBarImage, icons: tabIcons },
      header: { text: theme.header.text, tabText: theme.palette.subText, tabHighlightedText: theme.palette.text },
      main: {
        backgroundColor: theme.main.background.color,
        backgroundImage: RESOURCES.mainBackground.base,
        title: theme.main.title,
        titleHighlighted: theme.main.title,
        description: theme.main.description,
        paragraph: theme.main.paragraph,
        cellColor: theme.main.background.color,
        secondaryBackground: mix(theme.palette.background, theme.palette.text, 0.04),
        sectionBorder: theme.main.sectionBorder,
        sectionText: theme.palette.subText,
        featureText: theme.palette.text,
      },
      profileImage: RESOURCES.profile.base,
      chatroom: { backgroundColor: theme.chatroom.background.color, backgroundImage: RESOURCES.chatroomBackground.base },
      inputBar: {
        background: theme.inputBar.background,
        sendBackground: theme.inputBar.sendBackground,
        sendForeground: theme.inputBar.sendIcon,
        button: theme.inputBar.button,
        menuBackground: theme.inputBar.menuBackground,
        menuText: theme.inputBar.menuText,
      },
      send,
      receive,
      passcode: {
        backgroundColor: theme.passcode.background.color,
        backgroundImage: RESOURCES.passcodeBackground.base,
        title: theme.passcode.title,
        bullets,
        selectedBullets,
        keypadBackground: theme.passcode.keypadBackground,
        keypadText: theme.passcode.keypadText,
        keypadPressedImage: RESOURCES.passcodeKeypadPressed.base,
      },
      notificationBar: theme.notificationBar,
    }
    const css = serializeThemeCss(model)
    files.set(CSS_FILE_NAME, new Blob([CSS_BOM + css], { type: 'text/css;charset=utf-8' }))
    await Promise.all(encodes)
    return { files, css }
  } finally {
    // Drawing is done (all encodes started) or failed; let started encodes settle before returning.
    await Promise.allSettled(encodes)
    for (const d of decoded.values()) d.close()
  }

  async function emitBubble(base: string, b: ResolvedBubble): Promise<BubbleCss> {
    const textColors = {
      textColor: b.textColor,
      selectedTextColor: b.textColor,
      unreadTextColor: theme.palette.subText,
    }
    if (b.kind === 'image' && b.imageAssetId) {
      const main = await decode(b.imageAssetId)
      const group = b.groupImageAssetId ? await decode(b.groupImageAssetId) : main
      const g1 = imageBubbleGeometry(main.width, main.height, b.stretch, b.imageSize)
      const g2 = imageBubbleGeometry(group.width, group.height, b.group.stretch, b.group.imageSize)
      for (const [suffix, img, geo, dark] of [
        ['01', main, g1, false],
        ['01Selected', main, g1, true],
        ['02', group, g2, false],
        ['02Selected', group, g2, true],
      ] as const) {
        for (const scale of SCALES) {
          const s = raster.surface(geo.widthPt * scale, geo.heightPt * scale)
          drawScaled(s.ctx, img, s.width, s.height)
          if (dark) darkenDrawn(s.ctx, s.width, s.height, SELECTED_DARKEN)
          await encode(imagePath(`${base}${suffix}`, scale), s)
        }
      }
      return {
        image: `${base}01`,
        selectedImage: `${base}01Selected`,
        groupImage: `${base}02`,
        groupSelectedImage: `${base}02Selected`,
        stretch: g1.stretch,
        groupStretch: g2.stretch,
        insets: b.insets,
        groupInsets: b.group.insets,
        ...textColors,
      }
    }

    const geo = generatedBubbleGeometry(b)
    const size = { w: geo.widthPt, h: geo.heightPt }
    for (const [suffix, dark] of [
      ['01', false],
      ['01Selected', true],
      ['02', false],
      ['02Selected', true],
    ] as const) {
      await emit(`${base}${suffix}`, size, (ctx, w, h, scale) => {
        drawRoundedRect(ctx, w, h, geo.radiusPt * scale, b.color)
        if (dark) darkenDrawn(ctx, w, h, SELECTED_DARKEN)
      })
    }
    return {
      image: `${base}01`,
      selectedImage: `${base}01Selected`,
      groupImage: `${base}02`,
      groupSelectedImage: `${base}02Selected`,
      stretch: geo.stretch,
      groupStretch: geo.stretch,
      insets: b.insets,
      groupInsets: b.insets,
      ...textColors,
    }
  }
}
