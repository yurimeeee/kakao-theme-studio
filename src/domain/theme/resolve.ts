import { mix, readableOn } from './color'
import {
  TAB_KEYS,
  type AssetId,
  type BubbleImageLayout,
  type BubbleSetting,
  type FillSetting,
  type HexColor,
  type ImageFocus,
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
  focus: ImageFocus
}

export interface ResolvedBubble extends BubbleImageLayout {
  kind: 'generated' | 'image'
  color: HexColor
  textColor: HexColor
  shape: BubbleSetting['shape']
  radius: number
  imageAssetId: AssetId | null
  groupImageAssetId: AssetId | null
  /** 연속 메시지 layout: its own when a separate image has one, otherwise the first-message layout. */
  group: BubbleImageLayout
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
  /**
   * menuBackground / menuText: the input bar's menu button (`-ios-button-normal-background-color`,
   * `-ios-button-text-color`, reference 2 only). Derived, not edited separately.
   */
  inputBar: { background: HexColor; sendBackground: HexColor; sendIcon: HexColor; button: HexColor; menuBackground: HexColor; menuText: HexColor }
  bubbles: { send: ResolvedBubble; receive: ResolvedBubble }
  /** null → use the generated built-in default profile resource. */
  profileImageAssetId: AssetId | null
  profileFocus: ImageFocus
  /** null → draw the theme icon from the chat room background and bubble colors. */
  themeIconAssetId: AssetId | null
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
  const focus = { ...fill.focus }
  if (fill.mode === 'image' && fill.imageAssetId) return { color: fallbackColor, imageAssetId: fill.imageAssetId, focus }
  if (fill.mode === 'color') return { color: fill.color, imageAssetId: null, focus }
  return { color: fallbackColor, imageAssetId: null, focus }
}

const copyLayout = (l: BubbleImageLayout): BubbleImageLayout => ({
  insets: { ...l.insets },
  stretch: l.stretch ? { ...l.stretch } : null,
  imageSize: l.imageSize,
})

function resolveBubble(b: BubbleSetting, defaultColor: HexColor, paletteText: HexColor): ResolvedBubble {
  const color = b.mode === 'color' ? b.color : defaultColor
  const isImage = b.mode === 'image' && b.imageAssetId !== null
  const main = copyLayout(b.advanced)
  return {
    kind: isImage ? 'image' : 'generated',
    color,
    textColor: b.textColor ?? (isImage ? paletteText : readableOn(color, paletteText, 4.5)),
    shape: b.shape,
    radius: b.shape === 'square' ? 0 : b.radius,
    ...main,
    imageAssetId: isImage ? b.imageAssetId : null,
    groupImageAssetId: isImage ? b.advanced.groupImageAssetId : null,
    group: isImage && b.advanced.groupImageAssetId && b.advanced.group ? copyLayout(b.advanced.group) : copyLayout(main),
  }
}

/** Colors of the built-in default profile (preview, export, and import's detection of it). */
export function defaultProfileColors(palette: ThemeConfig['palette']): { bg: HexColor; fg: HexColor } {
  return { bg: mix(palette.background, palette.text, 0.1), fg: mix(palette.background, palette.text, 0.35) }
}

const resolvedCache = new WeakMap<ThemeConfig, ResolvedTheme>()

/**
 * resolveTheme memoized per config object. Editor configs are replaced, never mutated, on
 * every edit, so one resolution is shared by the preview and every panel. Treat the
 * result as read-only.
 */
/** Menu button: a faint tint of the button color on the bar (reference: #ffffff bar → #fafafa button). */
function resolveInputBar(background: HexColor, sendBackground: HexColor, sendIcon: HexColor, button: HexColor, text: HexColor): ResolvedTheme['inputBar'] {
  const menuBackground = mix(background, button, 0.06)
  return { background, sendBackground, sendIcon, button, menuBackground, menuText: readableOn(menuBackground, text, 4.5) }
}

export function resolveThemeCached(config: ThemeConfig): ResolvedTheme {
  let theme = resolvedCache.get(config)
  if (!theme) {
    theme = resolveTheme(config)
    resolvedCache.set(config, theme)
  }
  return theme
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
    inputBar: resolveInputBar(
      custom ? hi.inputBackground : palette.background,
      sendBackground,
      custom ? hi.sendIcon : readableOn(sendBackground, palette.text, 3),
      custom ? hi.buttonColor : palette.subText,
      palette.text,
    ),
    bubbles: {
      send: resolveBubble(config.bubbles.send, palette.accent, palette.text),
      receive: resolveBubble(config.bubbles.receive, palette.background, palette.text),
    },
    profileImageAssetId: config.profile.mode === 'image' ? config.profile.imageAssetId : null,
    profileFocus: { ...config.profile.focus },
    themeIconAssetId: config.themeIcon.mode === 'image' ? config.themeIcon.imageAssetId : null,
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
  add(theme.themeIconAssetId)
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
