/**
 * ThemeConfig is the serializable source of truth for one theme project.
 * It never contains Blobs or object URLs — images are referenced by AssetId and
 * stored separately by the AssetRepository.
 */

export const CURRENT_SCHEMA_VERSION = 1 as const

/** `#rrggbb`, lower-case. */
export type HexColor = string

/** Local asset id (`ast_…`). Never a URL, never a cloud storage path. */
export type AssetId = string

/**
 * - `default`: follow the global palette (전체 색상) or built-in resource
 * - `color`: element-specific color
 * - `image`: user uploaded image
 *
 * The inactive branch is kept (e.g. switching image → color keeps imageAssetId)
 * so mode changes never destroy an uploaded original.
 */
export type FillMode = 'default' | 'color' | 'image'

export interface FillSetting {
  mode: FillMode
  color: HexColor
  imageAssetId: AssetId | null
}

export type BubbleShape = 'square' | 'rounded' | 'capsule'

export interface EdgeInsets {
  top: number
  left: number
  bottom: number
  right: number
}

/** Where an image bubble stretches and where its text sits, in pt of the exported bubble. */
export interface BubbleImageLayout {
  /** Text padding inside the bubble, pt. */
  insets: EdgeInsets
  /**
   * Stretch point for image bubbles (pt from top-left, iOS cap semantics).
   * `null` = image center.
   */
  stretch: { x: number; y: number } | null
  /** Display size in % of the image read as @3x artwork (100 = px / 3 pt). */
  imageSize: number
}

export interface BubbleSetting {
  mode: FillMode
  color: HexColor
  /** `null` = follow palette text color. */
  textColor: HexColor | null
  imageAssetId: AssetId | null
  shape: BubbleShape
  /** Corner radius in pt for generated bubbles (ignored for capsule). */
  radius: number
  /** `insets` also pads generated bubbles; `stretch` and `imageSize` apply to image bubbles. */
  advanced: BubbleImageLayout & {
    /** Optional separate image for 연속 메시지; `null` reuses the main image. */
    groupImageAssetId: AssetId | null
    /** Layout of the 연속 메시지 image; `null` follows the first-message layout. */
    group: BubbleImageLayout | null
  }
}

export interface PaletteSetting {
  /** 주요 배경 */
  background: HexColor
  /** 주요 글자 */
  text: HexColor
  /** 보조 글자 */
  subText: HexColor
  /** 강조색 */
  accent: HexColor
}

export interface HeaderInputSetting {
  mode: 'default' | 'color'
  headerTextColor: HexColor
  inputBackground: HexColor
  sendBackground: HexColor
  sendIcon: HexColor
  buttonColor: HexColor
}

export interface ProfileSetting {
  mode: 'default' | 'image'
  imageAssetId: AssetId | null
}

/** Theme list icon (commonIcoTheme.png) and project thumbnail. `default` draws it from the theme colors. */
export interface ThemeIconSetting {
  mode: 'default' | 'image'
  imageAssetId: AssetId | null
}

/**
 * Editable tabs, in current KakaoTalk bottom-bar order. Each one has a CSS key observed
 * in a reference archive (see docs/ktheme-format.md §6); unverified tabs stay out.
 */
export const TAB_KEYS = ['friends', 'chats', 'now', 'shopping', 'more'] as const
export type TabKey = (typeof TAB_KEYS)[number]

export interface TabIconPair {
  normal: AssetId | null
  selected: AssetId | null
}

export interface TabsSetting {
  mode: 'default' | 'image'
  barColor: HexColor | null
  icons: Record<TabKey, TabIconPair>
}

export interface PasscodeSetting {
  background: FillSetting
  titleColor: HexColor | null
  keypadTextColor: HexColor | null
  keypadBackground: HexColor | null
  /** Color of the generated pressed-key circle. */
  pressedColor: HexColor | null
  bullets: {
    mode: 'default' | 'image'
    /** Generated bullet colors (empty / filled). */
    emptyColor: HexColor | null
    filledColor: HexColor | null
    /** 4 normal + 4 selected images, index 0–3. */
    normal: (AssetId | null)[]
    selected: (AssetId | null)[]
  }
}

export interface ThemeConfig {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION
  palette: PaletteSetting
  background: {
    /** Friends + chat list share one resource (MainViewStyle-Primary). */
    main: FillSetting
    /** Chat room (BackgroundStyle-ChatRoom). */
    chatroom: FillSetting
  }
  bubbles: {
    send: BubbleSetting
    receive: BubbleSetting
  }
  headerInput: HeaderInputSetting
  profile: ProfileSetting
  themeIcon: ThemeIconSetting
  tabs: TabsSetting
  passcode: PasscodeSetting
}

export type LocalProjectId = string

export interface ThemeProject {
  /** Local id (`lp_…`). Never reused as a cloud id. */
  id: LocalProjectId
  /**
   * Cloud link, set after the first successful cloud 저장. The three fields are set
   * and cleared together. A project linked to an account is only shown while that
   * account is signed in (private cache protection on sign-out / account switch).
   */
  cloudThemeId: string | null
  /** Firebase uid that owns `cloudThemeId`. */
  cloudOwnerId: string | null
  /** Cloud revision this local copy is based on; the next cloud save must match it. */
  cloudRevisionId: string | null
  /** Stable id written to the .ktheme manifest. */
  exportThemeId: string
  name: string
  config: ThemeConfig
  createdAt: number
  updatedAt: number
  /** Last explicit 저장 (not autosave). */
  savedAt: number | null
  /** Incremented on every successful local write. */
  revision: number
}

export type ElementKey =
  | 'palette'
  | 'background'
  | 'bubbleSend'
  | 'bubbleReceive'
  | 'headerInput'
  | 'profile'
  | 'themeIcon'
  | 'tabs'
  | 'passcode'

export type PreviewScreen = 'friends' | 'chats' | 'chatroom' | 'passcode'
