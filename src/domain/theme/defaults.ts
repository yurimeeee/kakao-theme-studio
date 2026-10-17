import { createExportThemeId, createLocalProjectId } from './ids'
import {
  CURRENT_SCHEMA_VERSION,
  type BubbleSetting,
  type ElementKey,
  type ThemeConfig,
  type ThemeProject,
} from './types'

export const DEFAULT_THEME_NAME = '이름 없는 테마'
export const THEME_NAME_MAX_LENGTH = 30

/** Text padding used by generated bubbles, pt. */
export const DEFAULT_BUBBLE_INSETS = { top: 9, left: 12, bottom: 9, right: 12 }
export const BUBBLE_RADIUS_MIN = 0
export const BUBBLE_RADIUS_MAX = 20
/** Image bubble display size, % of the image read as @3x (see BubbleImageLayout.imageSize). */
export const BUBBLE_IMAGE_SIZE_DEFAULT = 100
export const BUBBLE_IMAGE_SIZE_MIN = 20
export const BUBBLE_IMAGE_SIZE_MAX = 300

function bubble(color: string): BubbleSetting {
  return {
    mode: 'default',
    color,
    textColor: null,
    imageAssetId: null,
    shape: 'rounded',
    radius: 16,
    advanced: {
      insets: { ...DEFAULT_BUBBLE_INSETS },
      stretch: null,
      imageSize: BUBBLE_IMAGE_SIZE_DEFAULT,
      groupImageAssetId: null,
      group: null,
    },
  }
}

export function createDefaultConfig(): ThemeConfig {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    palette: {
      background: '#ffffff',
      text: '#222224',
      subText: '#8a8a92',
      accent: '#d9d9df',
    },
    background: {
      main: { mode: 'default', color: '#ffffff', imageAssetId: null },
      chatroom: { mode: 'default', color: '#ececef', imageAssetId: null },
    },
    bubbles: {
      send: bubble('#d9d9df'),
      receive: bubble('#ffffff'),
    },
    headerInput: {
      mode: 'default',
      headerTextColor: '#222224',
      inputBackground: '#ffffff',
      sendBackground: '#d9d9df',
      sendIcon: '#222224',
      buttonColor: '#8a8a92',
    },
    profile: { mode: 'default', imageAssetId: null },
    themeIcon: { mode: 'default', imageAssetId: null },
    tabs: {
      mode: 'default',
      barColor: null,
      icons: {
        friends: { normal: null, selected: null },
        chats: { normal: null, selected: null },
        now: { normal: null, selected: null },
        shopping: { normal: null, selected: null },
        more: { normal: null, selected: null },
      },
    },
    passcode: {
      background: { mode: 'default', color: '#ffffff', imageAssetId: null },
      titleColor: null,
      keypadTextColor: null,
      keypadBackground: null,
      pressedColor: null,
      bullets: {
        mode: 'default',
        emptyColor: null,
        filledColor: null,
        normal: [null, null, null, null],
        selected: [null, null, null, null],
      },
    },
  }
}

/** Where each editor element lives in the config. */
const ELEMENT_PATHS: Record<ElementKey, readonly [keyof ThemeConfig, ...string[]]> = {
  palette: ['palette'],
  background: ['background'],
  bubbleSend: ['bubbles', 'send'],
  bubbleReceive: ['bubbles', 'receive'],
  headerInput: ['headerInput'],
  profile: ['profile'],
  themeIcon: ['themeIcon'],
  tabs: ['tabs'],
  passcode: ['passcode'],
}

type Node = Record<string, unknown>

/** Structural equality for plain config data; key order does not matter (stored configs may differ). */
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => sameData((a as Node)[k], (b as Node)[k]))
}
const parentOf = (config: ThemeConfig, element: ElementKey) => {
  const path = ELEMENT_PATHS[element]
  const parent = path.slice(0, -1).reduce<Node>((node, key) => node[key] as Node, config as unknown as Node)
  return { parent, key: path[path.length - 1] }
}

/** Whether an element still has its default settings (a reset would change nothing). */
export function isElementDefault(config: ThemeConfig, element: ElementKey): boolean {
  const current = parentOf(config, element)
  const initial = parentOf(createDefaultConfig(), element)
  return sameData(current.parent[current.key], initial.parent[initial.key])
}

/** Put one element back to its defaults, in place. Its image references go too (실행 취소 restores them). */
export function resetElement(config: ThemeConfig, element: ElementKey): void {
  const { parent, key } = parentOf(config, element)
  const initial = parentOf(createDefaultConfig(), element)
  parent[key] = initial.parent[initial.key]
}

export function createNewProject(now = Date.now()): ThemeProject {
  return {
    id: createLocalProjectId(),
    cloudThemeId: null,
    cloudOwnerId: null,
    cloudRevisionId: null,
    exportThemeId: createExportThemeId(),
    name: DEFAULT_THEME_NAME,
    config: createDefaultConfig(),
    createdAt: now,
    updatedAt: now,
    savedAt: null,
    revision: 0,
    origin: null,
  }
}
