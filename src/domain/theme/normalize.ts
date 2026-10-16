import { isHexColor, normalizeHex } from './color'
import { BUBBLE_IMAGE_SIZE_MAX, BUBBLE_IMAGE_SIZE_MIN, BUBBLE_RADIUS_MAX, BUBBLE_RADIUS_MIN, createDefaultConfig, THEME_NAME_MAX_LENGTH } from './defaults'
import { isAssetId } from './ids'
import {
  CURRENT_SCHEMA_VERSION,
  TAB_KEYS,
  type AssetId,
  type BubbleImageLayout,
  type BubbleSetting,
  type EdgeInsets,
  type FillSetting,
  type HexColor,
  type ThemeConfig,
  type ThemeOrigin,
} from './types'

export class UnsupportedSchemaError extends Error {
  readonly version: unknown

  constructor(version: unknown) {
    super(`Unsupported theme schema version: ${String(version)}`)
    this.version = version
    this.name = 'UnsupportedSchemaError'
  }
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})

function color(v: unknown, fallback: HexColor): HexColor {
  if (isHexColor(v)) return v
  if (typeof v === 'string') return normalizeHex(v) ?? fallback
  return fallback
}

function optColor(v: unknown, fallback: HexColor | null): HexColor | null {
  if (v === null) return null
  if (v === undefined) return fallback
  return typeof v === 'string' ? (normalizeHex(v) ?? fallback) : fallback
}

function asset(v: unknown): AssetId | null {
  return isAssetId(v) ? v : null
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.min(max, Math.max(min, n))
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback
}

function fill(v: unknown, d: FillSetting): FillSetting {
  const o = obj(v)
  return {
    mode: oneOf(o.mode, ['default', 'color', 'image'] as const, d.mode),
    color: color(o.color, d.color),
    imageAssetId: asset(o.imageAssetId),
  }
}

/** Image bubbles may pad text by up to their own size (large decorations). */
const INSET_LIMIT = 600

function insets(v: unknown, d: EdgeInsets): EdgeInsets {
  const o = obj(v)
  return {
    top: num(o.top, d.top, 0, INSET_LIMIT),
    left: num(o.left, d.left, 0, INSET_LIMIT),
    bottom: num(o.bottom, d.bottom, 0, INSET_LIMIT),
    right: num(o.right, d.right, 0, INSET_LIMIT),
  }
}

function stretch(v: unknown): BubbleImageLayout['stretch'] {
  const st = obj(v)
  return v != null && typeof st.x === 'number' && typeof st.y === 'number' ? { x: num(st.x, 0, 0, 2000), y: num(st.y, 0, 0, 2000) } : null
}

const imageSize = (v: unknown, fallback: number) => num(v, fallback, BUBBLE_IMAGE_SIZE_MIN, BUBBLE_IMAGE_SIZE_MAX)

function bubble(v: unknown, d: BubbleSetting): BubbleSetting {
  const o = obj(v)
  const adv = obj(o.advanced)
  const main = {
    insets: insets(adv.insets, d.advanced.insets),
    stretch: stretch(adv.stretch),
    imageSize: imageSize(adv.imageSize, d.advanced.imageSize),
  }
  const g = obj(adv.group)
  return {
    mode: oneOf(o.mode, ['default', 'color', 'image'] as const, d.mode),
    color: color(o.color, d.color),
    textColor: optColor(o.textColor, d.textColor),
    imageAssetId: asset(o.imageAssetId),
    shape: oneOf(o.shape, ['square', 'rounded', 'capsule'] as const, d.shape),
    radius: num(o.radius, d.radius, BUBBLE_RADIUS_MIN, BUBBLE_RADIUS_MAX),
    advanced: {
      ...main,
      groupImageAssetId: asset(adv.groupImageAssetId),
      group:
        adv.group != null && typeof adv.group === 'object'
          ? { insets: insets(g.insets, main.insets), stretch: stretch(g.stretch), imageSize: imageSize(g.imageSize, main.imageSize) }
          : null,
    },
  }
}

function assetList(v: unknown): (AssetId | null)[] {
  const arr = Array.isArray(v) ? v : []
  return [0, 1, 2, 3].map((i) => asset(arr[i]))
}

/**
 * Brings any stored value up to the current schema and repairs invalid leaves
 * with defaults. Unknown keys are dropped. Throws for versions newer than this
 * build understands so we never silently downgrade data.
 */
export function migrateConfig(raw: unknown): ThemeConfig {
  const o = obj(raw)
  const version = o.schemaVersion ?? 1
  if (typeof version !== 'number' || version > CURRENT_SCHEMA_VERSION || version < 1) {
    throw new UnsupportedSchemaError(version)
  }
  // Future migrations go here: if (version === 1) o = migrateV1toV2(o) …
  return normalizeConfig(o)
}

export function normalizeConfig(raw: unknown): ThemeConfig {
  const d = createDefaultConfig()
  const o = obj(raw)
  const p = obj(o.palette)
  const bg = obj(o.background)
  const b = obj(o.bubbles)
  const hi = obj(o.headerInput)
  const pr = obj(o.profile)
  const ti = obj(o.themeIcon)
  const t = obj(o.tabs)
  const icons = obj(t.icons)
  const pc = obj(o.passcode)
  const bl = obj(pc.bullets)

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    palette: {
      background: color(p.background, d.palette.background),
      text: color(p.text, d.palette.text),
      subText: color(p.subText, d.palette.subText),
      accent: color(p.accent, d.palette.accent),
    },
    background: {
      main: fill(bg.main, d.background.main),
      chatroom: fill(bg.chatroom, d.background.chatroom),
    },
    bubbles: {
      send: bubble(b.send, d.bubbles.send),
      receive: bubble(b.receive, d.bubbles.receive),
    },
    headerInput: {
      mode: oneOf(hi.mode, ['default', 'color'] as const, d.headerInput.mode),
      headerTextColor: color(hi.headerTextColor, d.headerInput.headerTextColor),
      inputBackground: color(hi.inputBackground, d.headerInput.inputBackground),
      sendBackground: color(hi.sendBackground, d.headerInput.sendBackground),
      sendIcon: color(hi.sendIcon, d.headerInput.sendIcon),
      buttonColor: color(hi.buttonColor, d.headerInput.buttonColor),
    },
    profile: {
      mode: oneOf(pr.mode, ['default', 'image'] as const, d.profile.mode),
      imageAssetId: asset(pr.imageAssetId),
    },
    themeIcon: {
      mode: oneOf(ti.mode, ['default', 'image'] as const, d.themeIcon.mode),
      imageAssetId: asset(ti.imageAssetId),
    },
    tabs: {
      mode: oneOf(t.mode, ['default', 'image'] as const, d.tabs.mode),
      barColor: optColor(t.barColor, d.tabs.barColor),
      icons: Object.fromEntries(
        TAB_KEYS.map((k) => {
          const pair = obj(icons[k])
          return [k, { normal: asset(pair.normal), selected: asset(pair.selected) }]
        }),
      ) as ThemeConfig['tabs']['icons'],
    },
    passcode: {
      background: fill(pc.background, d.passcode.background),
      titleColor: optColor(pc.titleColor, d.passcode.titleColor),
      keypadTextColor: optColor(pc.keypadTextColor, d.passcode.keypadTextColor),
      keypadBackground: optColor(pc.keypadBackground, d.passcode.keypadBackground),
      pressedColor: optColor(pc.pressedColor, d.passcode.pressedColor),
      bullets: {
        mode: oneOf(bl.mode, ['default', 'image'] as const, d.passcode.bullets.mode),
        emptyColor: optColor(bl.emptyColor, d.passcode.bullets.emptyColor),
        filledColor: optColor(bl.filledColor, d.passcode.bullets.filledColor),
        normal: assetList(bl.normal),
        selected: assetList(bl.selected),
      },
    },
  }
}

/**
 * Every asset id the config references, including inactive branches
 * (an image kept while the element is in color mode is still referenced).
 */
export function collectAssetIds(config: ThemeConfig): Set<AssetId> {
  const ids = new Set<AssetId>()
  const add = (id: AssetId | null) => {
    if (id) ids.add(id)
  }
  add(config.background.main.imageAssetId)
  add(config.background.chatroom.imageAssetId)
  for (const bub of [config.bubbles.send, config.bubbles.receive]) {
    add(bub.imageAssetId)
    add(bub.advanced.groupImageAssetId)
  }
  add(config.profile.imageAssetId)
  add(config.themeIcon.imageAssetId)
  for (const k of TAB_KEYS) {
    add(config.tabs.icons[k].normal)
    add(config.tabs.icons[k].selected)
  }
  add(config.passcode.background.imageAssetId)
  config.passcode.bullets.normal.forEach(add)
  config.passcode.bullets.selected.forEach(add)
  return ids
}

/** Returns a copy of `config` with every asset reference passed through `map` (inactive branches included). */
export function mapAssetRefs(config: ThemeConfig, map: (id: AssetId) => AssetId | null): ThemeConfig {
  const next = structuredClone(config)
  const m = (id: AssetId | null) => (id ? map(id) : null)
  next.background.main.imageAssetId = m(next.background.main.imageAssetId)
  next.background.chatroom.imageAssetId = m(next.background.chatroom.imageAssetId)
  for (const b of [next.bubbles.send, next.bubbles.receive]) {
    b.imageAssetId = m(b.imageAssetId)
    b.advanced.groupImageAssetId = m(b.advanced.groupImageAssetId)
  }
  next.profile.imageAssetId = m(next.profile.imageAssetId)
  next.themeIcon.imageAssetId = m(next.themeIcon.imageAssetId)
  for (const k of TAB_KEYS) {
    next.tabs.icons[k].normal = m(next.tabs.icons[k].normal)
    next.tabs.icons[k].selected = m(next.tabs.icons[k].selected)
  }
  next.passcode.background.imageAssetId = m(next.passcode.background.imageAssetId)
  next.passcode.bullets.normal = next.passcode.bullets.normal.map(m)
  next.passcode.bullets.selected = next.passcode.bullets.selected.map(m)
  return next
}

/** Returns a copy of `config` with every reference to `ids` cleared (used when stored images are missing). */
export function removeAssetRefs(config: ThemeConfig, ids: ReadonlySet<AssetId>): ThemeConfig {
  return mapAssetRefs(config, (id) => (ids.has(id) ? null : id))
}

/** Validates stored origin data (local rows, cloud documents); anything malformed reads as null. */
export function normalizeOrigin(value: unknown): ThemeOrigin | null {
  if (!value || typeof value !== 'object') return null
  const { shareId, name, ownerName } = value as Record<string, unknown>
  if (typeof shareId !== 'string' || !/^[A-Za-z0-9]{22}$/.test(shareId)) return null
  if (typeof name !== 'string' || typeof ownerName !== 'string') return null
  return { shareId, name: name.slice(0, THEME_NAME_MAX_LENGTH), ownerName: ownerName.slice(0, 40) }
}
