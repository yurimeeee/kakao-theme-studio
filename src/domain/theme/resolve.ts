import { mix, readableOn } from './color'
import {
  TAB_KEYS,
  type AssetId,
  type BubbleSetting,
  type EdgeInsets,
  type FillSetting,
  type HexColor,
  type TabKey,
  type ThemeConfig,
} from './types'

/**
 * ResolvedTheme is the single normalized model consumed by BOTH the web preview
 * and the .ktheme exporter. All "default"/palette inheritance rules live here:
 *
 * - Element mode `default` → value derived from 전체 색상 (palette).
 * - Element mode `color`   → element's own color overrides the palette.
 * - Element mode `image`   → image if one is attached, otherwise falls back to `default`.
 */

export interface ResolvedFill {
  color: HexColor
  /** Present only when the element is in image mode and an image is attached. */
  imageAssetId: AssetId | null
}

export interface ResolvedBubble {
  kind: 'generated' | 'image'
  color: HexColor
  textColor: HexColor
  shape: BubbleSetting['shape']
  radius: number
  insets: EdgeInsets
  imageAssetId: AssetId | null
  groupImageAssetId: AssetId | null
  stretch: { x: number; y: number } | null
}

export interface ResolvedTabIcon {
  normal: AssetId
  selected: AssetId
}

export type ResolvedBullets =
  | { kind: 'generated'; emptyColor: HexColor; filledColor: HexColor }
  | { kind: 'image'; normal: AssetId[]; selected: AssetId[] }

export interface ResolvedTheme {
  palette: ThemeConfig['palette']
  main: {
    background: ResolvedFill
    title: HexColor
    description: HexColor
    paragraph: HexColor
    sectionBorder: HexColor
  }
  header: { text: HexColor }
  chatroom: { background: ResolvedFill }
  inputBar: { background: HexColor; sendBackground: HexColor; sendIcon: HexColor; button: HexColor }
  bubbles: { send: ResolvedBubble; receive: ResolvedBubble }
  /** null → use the generated built-in default profile resource. */
  profileImageAssetId: AssetId | null
  tabs: {
    barColor: HexColor | null
    /** Only tabs with an uploaded normal image. Missing selected → normal reused. */
    icons: Partial<Record<TabKey, ResolvedTabIcon>>
    /** Preview-only tint for app-default icons. */
    tintNormal: HexColor
    tintSelected: HexColor
  }
  passcode: {
    background: ResolvedFill
    title: HexColor
    keypadText: HexColor
    keypadBackground: HexColor
    pressed: HexColor
    bullets: ResolvedBullets
  }
  notificationBar: { background: HexColor; name: HexColor; message: HexColor }
}

function resolveFill(fill: FillSetting, fallbackColor: HexColor): ResolvedFill {
  if (fill.mode === 'image' && fill.imageAssetId) return { color: fallbackColor, imageAssetId: fill.imageAssetId }
  if (fill.mode === 'color') return { color: fill.color, imageAssetId: null }
  return { color: fallbackColor, imageAssetId: null }
}

function resolveBubble(b: BubbleSetting, defaultColor: HexColor, paletteText: HexColor): ResolvedBubble {
  const color = b.mode === 'color' ? b.color : defaultColor
  const isImage = b.mode === 'image' && b.imageAssetId !== null
  return {
    kind: isImage ? 'image' : 'generated',
    color,
    textColor: b.textColor ?? (isImage ? paletteText : readableOn(color, paletteText, 4.5)),
    shape: b.shape,
    radius: b.shape === 'square' ? 0 : b.radius,
    insets: { ...b.advanced.insets },
    imageAssetId: isImage ? b.imageAssetId : null,
    groupImageAssetId: isImage ? b.advanced.groupImageAssetId : null,
    stretch: b.advanced.stretch ? { ...b.advanced.stretch } : null,
  }
}

export function resolveTheme(config: ThemeConfig): ResolvedTheme {
  const { palette } = config
  const chatroomDefault = mix(palette.background, palette.text, 0.08)

  const hi = config.headerInput
  const custom = hi.mode === 'color'
  const sendBackground = custom ? hi.sendBackground : palette.accent

  const pc = config.passcode
  const passBg = resolveFill(pc.background, palette.background)
  const keypadBackground = pc.keypadBackground ?? passBg.color

  const icons: ResolvedTheme['tabs']['icons'] = {}
  if (config.tabs.mode === 'image') {
    for (const k of TAB_KEYS) {
      const pair = config.tabs.icons[k]
      if (pair.normal) icons[k] = { normal: pair.normal, selected: pair.selected ?? pair.normal }
    }
  }

  const bl = pc.bullets
  const imageBullets =
    bl.mode === 'image' && bl.normal.every((id) => id !== null) && bl.selected.every((id) => id !== null)
  const bullets: ResolvedBullets = imageBullets
    ? { kind: 'image', normal: bl.normal as AssetId[], selected: bl.selected as AssetId[] }
    : {
        kind: 'generated',
        emptyColor: bl.emptyColor ?? mix(passBg.color, palette.text, 0.16),
        filledColor: bl.filledColor ?? readableOn(passBg.color, palette.accent, 1.6),
      }

  return {
    palette: { ...palette },
    main: {
      background: resolveFill(config.background.main, palette.background),
      title: palette.text,
      description: palette.subText,
      paragraph: palette.subText,
      sectionBorder: mix(palette.background, palette.text, 0.12),
    },
    header: { text: custom ? hi.headerTextColor : palette.text },
    chatroom: { background: resolveFill(config.background.chatroom, chatroomDefault) },
    inputBar: {
      background: custom ? hi.inputBackground : palette.background,
      sendBackground,
      sendIcon: custom ? hi.sendIcon : readableOn(sendBackground, palette.text, 3),
      button: custom ? hi.buttonColor : palette.subText,
    },
    bubbles: {
      send: resolveBubble(config.bubbles.send, palette.accent, palette.text),
      receive: resolveBubble(config.bubbles.receive, palette.background, palette.text),
    },
    profileImageAssetId: config.profile.mode === 'image' ? config.profile.imageAssetId : null,
    tabs: {
      barColor: config.tabs.barColor,
      icons,
      tintNormal: palette.subText,
      tintSelected: palette.text,
    },
    passcode: {
      background: passBg,
      title: pc.titleColor ?? palette.text,
      keypadText: pc.keypadTextColor ?? palette.text,
      keypadBackground,
      pressed: pc.pressedColor ?? mix(keypadBackground, palette.text, 0.12),
      bullets,
    },
    notificationBar: {
      background: palette.background,
      name: palette.text,
      message: palette.subText,
    },
  }
}

/** Assets the resolved theme actually uses (the active subset of collectAssetIds). */
export function activeAssetIds(theme: ResolvedTheme): Set<AssetId> {
  const ids = new Set<AssetId>()
  const add = (id: AssetId | null | undefined) => {
    if (id) ids.add(id)
  }
  add(theme.main.background.imageAssetId)
  add(theme.chatroom.background.imageAssetId)
  add(theme.bubbles.send.imageAssetId)
  add(theme.bubbles.send.groupImageAssetId)
  add(theme.bubbles.receive.imageAssetId)
  add(theme.bubbles.receive.groupImageAssetId)
  add(theme.profileImageAssetId)
  for (const pair of Object.values(theme.tabs.icons)) {
    add(pair.normal)
    add(pair.selected)
  }
  add(theme.passcode.background.imageAssetId)
  if (theme.passcode.bullets.kind === 'image') {
    theme.passcode.bullets.normal.forEach(add)
    theme.passcode.bullets.selected.forEach(add)
  }
  return ids
}
