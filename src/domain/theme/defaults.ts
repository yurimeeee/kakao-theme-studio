import { createExportThemeId, createLocalProjectId } from './ids'
import {
  CURRENT_SCHEMA_VERSION,
  type BubbleSetting,
  type ThemeConfig,
  type ThemeProject,
} from './types'

export const DEFAULT_THEME_NAME = '이름 없는 테마'
export const THEME_NAME_MAX_LENGTH = 30

/** Text padding used by generated bubbles, pt. */
export const DEFAULT_BUBBLE_INSETS = { top: 9, left: 12, bottom: 9, right: 12 }
export const BUBBLE_RADIUS_MIN = 0
export const BUBBLE_RADIUS_MAX = 20

function bubble(color: string): BubbleSetting {
  return {
    mode: 'default',
    color,
    textColor: null,
    imageAssetId: null,
    shape: 'rounded',
    radius: 16,
    advanced: { insets: { ...DEFAULT_BUBBLE_INSETS }, stretch: null, groupImageAssetId: null },
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
    tabs: {
      mode: 'default',
      barColor: null,
      icons: {
        friends: { normal: null, selected: null },
        chats: { normal: null, selected: null },
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

export function createNewProject(now = Date.now()): ThemeProject {
  return {
    id: createLocalProjectId(),
    cloudThemeId: null,
    exportThemeId: createExportThemeId(),
    name: DEFAULT_THEME_NAME,
    config: createDefaultConfig(),
    createdAt: now,
    updatedAt: now,
    savedAt: null,
    revision: 0,
  }
}
