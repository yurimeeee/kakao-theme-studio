import type { TabKey } from '@/domain/theme/types'

/**
 * Resource catalog for the iOS .ktheme adapter.
 *
 * Every entry records where its facts come from:
 * - `reference`: observed in the reference archive (CSS property + image present).
 *   Sizes are the reference @3x pixel size / 3.
 * - `assumed`: our choice where the reference gives no answer. Needs device check.
 *
 * NOTHING here is device-verified yet. See docs/ktheme-format.md.
 */

export const ADAPTER_VERSION = 'ios-css-ref2023-r1'
export const CSS_FILE_NAME = 'KakaoTalkTheme.css'
export const IMAGES_DIR = 'Images'
export const THEME_ICON_FILE = 'commonIcoTheme.png'
export const SCALES = [2, 3] as const
export type Scale = (typeof SCALES)[number]

export type Evidence = 'reference' | 'assumed'

export interface ImageResourceSpec {
  /** Base name used in CSS (`'name.png'`) and in Images/name@Nx.png. */
  base: string
  /** Logical size in pt (px = pt * scale). `null` = derived per export (bubbles). */
  sizePt: { w: number; h: number } | null
  evidence: Evidence
  note: string
}

export const RESOURCES = {
  mainBackground: {
    base: 'mainBgImage',
    sizePt: { w: 375, h: 750 },
    evidence: 'reference',
    note: 'MainViewStyle-Primary -ios-background-image. Friends + chat list share it. Reference ships @3x 1125×2250 only.',
  },
  chatroomBackground: {
    base: 'chatroomBgImage',
    sizePt: { w: 375, h: 750 },
    evidence: 'reference',
    note: 'BackgroundStyle-ChatRoom. Reference ships @3x 1125×2250 only.',
  },
  passcodeBackground: {
    base: 'passcodeBgImage',
    sizePt: { w: 400, h: 400 },
    evidence: 'reference',
    note: 'BackgroundStyle-Passcode. Reference ships @3x 1200×1200 only; on-device crop/tiling unknown.',
  },
  tabBarBackground: {
    base: 'maintabBgImage',
    sizePt: { w: 470, h: 49 },
    evidence: 'reference',
    note: 'TabBarStyle-Main -ios-background-image (comment: top-center-crop). @2x 940×98, @3x 1410×147.',
  },
  profile: {
    base: 'profileImg01',
    sizePt: { w: 100, h: 100 },
    evidence: 'reference',
    note: 'DefaultProfileStyle -ios-profile-images. Reference ships @3x 300×300 only.',
  },
  tabIcon: {
    base: 'maintabIco',
    sizePt: { w: 40, h: 40 },
    evidence: 'reference',
    note: 'Reference @3x 120×120 (40pt) but @2x 76×76 (38pt). We emit 40pt for both scales.',
  },
  passcodeBullet: {
    base: 'passcodeImgCode',
    sizePt: { w: 48, h: 48 },
    evidence: 'assumed',
    note: 'Reference bullets are 200×200 @3x character art. Generated bullets use a 48pt canvas with a 16pt dot — size on device unverified.',
  },
  passcodeKeypadPressed: {
    base: 'passcodeKeypadPressed',
    sizePt: { w: 60, h: 60 },
    evidence: 'reference',
    note: 'PasscodeStyle -ios-keypad-number-highlighted-image. Reference @3x 180×180.',
  },
  bubbleSend: {
    base: 'chatroomBubbleSend',
    sizePt: null,
    evidence: 'reference',
    note: 'MessageCellStyle-Send. 01 = first message, 02 = grouped (연속), *Selected = pressed.',
  },
  bubbleReceive: {
    base: 'chatroomBubbleReceive',
    sizePt: null,
    evidence: 'reference',
    note: 'MessageCellStyle-Receive. Same file family as send.',
  },
} satisfies Record<string, ImageResourceSpec>

/**
 * Tab CSS keys observed in reference TabBarStyle-Main blocks. The "지금" tab replaced the
 * open chat tab; reference 2 writes the same images to `now` and to `openchats`
 * (commented "오픈채팅탭 (하위호환)"), so both are emitted.
 */
export const TAB_CSS_KEYS = {
  friends: ['friends'],
  chats: ['chats'],
  now: ['now', 'openchats'],
  shopping: ['shopping'],
  more: ['more'],
} as const satisfies Record<TabKey, readonly string[]>
export const TAB_FILE_KEYS = { friends: 'Friends', chats: 'Chats', now: 'Now', shopping: 'Shopping', more: 'More' } as const satisfies Record<TabKey, string>

/** Capsule bubbles use this radius (pt): half of a one-line bubble height. */
export const CAPSULE_RADIUS_PT = 17
/** Minimum corner cap for generated bubbles so square bubbles still have a stretchable image. */
export const MIN_BUBBLE_CAP_PT = 8
export const SELECTED_DARKEN = 0.1
export const THEME_ICON_PX = 200
