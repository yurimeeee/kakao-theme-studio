import { sha256Hex } from '@/assets/hash'
import type { SupportedImageMime } from '@/assets/types'
import { IMAGE_LIMITS, sniffImageMime } from '@/assets/validation'
import { normalizeHex } from '@/domain/theme/color'
import { BUBBLE_IMAGE_SIZE_MAX, BUBBLE_RADIUS_MAX, centerFocus, createDefaultConfig } from '@/domain/theme/defaults'
import { createAssetId } from '@/domain/theme/ids'
import { collectAssetIds } from '@/domain/theme/normalize'
import { resolveTheme } from '@/domain/theme/resolve'
import { TAB_KEYS, type AssetId, type BubbleImageLayout, type EdgeInsets, type FillSetting, type HexColor, type TabKey, type ThemeConfig } from '@/domain/theme/types'
import { TAB_CSS_KEYS } from '@/exporters/ktheme/catalog'
import { parseThemeCss } from '@/exporters/ktheme/css'
import type { ImageProbe, ImageSummary } from './probe'
import type { ThemeArchive } from './readArchive'

export interface ImportedImage {
  blob: Blob
  mime: SupportedImageMime
  width: number
  height: number
  hash: string
  name: string
}

export interface ImportedTheme {
  /** Manifest name as written (not yet normalized to the editor's limits). */
  name: string
  config: ThemeConfig
  /** Images the config references, keyed by fresh asset ids (not tied to a project yet). */
  images: Map<AssetId, ImportedImage>
  /** Things the editor cannot represent, phrased for the user. */
  notes: string[]
}

interface Loaded {
  id: AssetId
  summary: ImageSummary
  scale: number
  /** Size in pt (px / scale). */
  widthPt: number
  heightPt: number
}

interface ImageRef {
  base: string
  x: number | null
  y: number | null
}

/** Other tab keys seen in reference themes; the editor has no slot for them. */
const UNSUPPORTED_TABS: Record<string, string> = { find: '찾기', browse: '채널', piccoma: '만화', game: '게임', call: '콜' }
const ORDINALS = ['first', 'second', 'third', 'fourth'] as const
/** Along the diagonal a rounded corner of radius r is clear for r·(1 − 1/√2). */
const DIAGONAL_PER_RADIUS = 1 - Math.SQRT1_2

const unquote = (v: string) => v.trim().replace(/^(['"])(.*)\1$/, '$2')
const sameColor = (a: HexColor | null, b: HexColor) => a === null || a === b

/**
 * Maps a theme archive back onto the editor model. Values the editor derives from 전체 색상
 * stay in `default` mode when the file matches the derivation, so re-importing a theme made
 * here keeps it editable instead of freezing every color.
 */
export async function mapThemeArchive(archive: ThemeArchive, probe: ImageProbe): Promise<ImportedTheme> {
  const parsed = parseThemeCss(archive.css)
  const raw = (selector: string, prop: string) => parsed.get(selector)?.get(prop) ?? null
  const colorOf = (selector: string, prop: string) => {
    const v = raw(selector, prop)
    return v ? normalizeHex(v.split(/\s+/)[0]) : null
  }
  const refOf = (selector: string, prop: string): ImageRef | null => {
    const m = /['"]([^'"]+?)\.png['"](?:\s+(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?)?/.exec(raw(selector, prop) ?? '')
    if (!m) return null
    return { base: m[1], x: m[2] !== undefined ? Number(m[2]) : null, y: m[3] !== undefined ? Number(m[3]) : null }
  }
  const insetsOf = (selector: string, prop: string): EdgeInsets | null => {
    const n = (raw(selector, prop) ?? '').match(/-?[\d.]+/g)?.map(Number)
    return n && n.length >= 4 ? { top: n[0], left: n[1], bottom: n[2], right: n[3] } : null
  }

  const notes = new Set<string>()
  const missing = new Set<string>()
  const images = new Map<AssetId, ImportedImage>()
  const byHash = new Map<string, AssetId>()
  const summaries = new Map<AssetId, ImageSummary>()

  /** Validates and stores one image (deduped by content); null when it is not a usable image. */
  const addImage = async (blob: Blob, name: string): Promise<{ id: AssetId; summary: ImageSummary } | null> => {
    const mime = sniffImageMime(new Uint8Array(await blob.slice(0, 16).arrayBuffer()))
    if (!mime || blob.size > IMAGE_LIMITS.maxBytes) return null
    const hash = await sha256Hex(blob)
    const known = byHash.get(hash)
    if (known) return { id: known, summary: summaries.get(known)! }
    let summary: ImageSummary
    try {
      summary = await probe(blob)
    } catch {
      return null
    }
    if (!summary.width || !summary.height || summary.width > IMAGE_LIMITS.maxSide || summary.height > IMAGE_LIMITS.maxSide) return null
    const id = createAssetId()
    byHash.set(hash, id)
    summaries.set(id, summary)
    images.set(id, { blob: new Blob([blob], { type: mime }), mime, width: summary.width, height: summary.height, hash, name: name.slice(0, 120) })
    return { id, summary }
  }

  const loaded = new Map<string, Promise<Loaded | null>>()
  const load = (ref: ImageRef | null): Promise<Loaded | null> => {
    if (!ref) return Promise.resolve(null)
    let hit = loaded.get(ref.base)
    if (!hit) {
      hit = (async () => {
        const file = await archive.image(ref.base)
        const added = file && (await addImage(file.blob, `${ref.base}.png`))
        if (!file || !added) {
          missing.add(`${ref.base}.png`)
          return null
        }
        const { summary } = added
        return { ...added, scale: file.scale, widthPt: summary.width / file.scale, heightPt: summary.height / file.scale }
      })()
      loaded.set(ref.base, hit)
    }
    return hit
  }

  const config = createDefaultConfig()
  const derived = () => resolveTheme(config)

  // 전체 색상: the values every other element derives from.
  const p = config.palette
  p.background = colorOf('MainViewStyle-Primary', 'background-color') ?? p.background
  p.text = colorOf('MainViewStyle-Primary', '-ios-text-color') ?? colorOf('HeaderStyle-Main', '-ios-text-color') ?? p.text
  p.subText = colorOf('MainViewStyle-Primary', '-ios-description-text-color') ?? colorOf('MainViewStyle-Primary', '-ios-paragraph-text-color') ?? p.subText
  p.accent = colorOf('InputBarStyle-Chat', '-ios-send-normal-background-color') ?? p.accent

  /** Background: a solid image (exporters often add one next to the color) reads as a color. */
  const readFill = async (selector: string, target: FillSetting, derivedColor: () => HexColor) => {
    const image = await load(refOf(selector, '-ios-background-image'))
    const color = image?.summary.solid ?? colorOf(selector, 'background-color')
    if (image && !image.summary.solid) {
      Object.assign(target, { mode: 'image', imageAssetId: image.id, color: colorOf(selector, 'background-color') ?? derivedColor(), focus: centerFocus() })
    } else if (color && color !== derivedColor()) {
      Object.assign(target, { mode: 'color', color })
    }
  }
  await readFill('MainViewStyle-Primary', config.background.main, () => derived().main.background.color)
  await readFill('BackgroundStyle-ChatRoom', config.background.chatroom, () => derived().chatroom.background.color)

  // 상단·입력창: stays `default` unless the file differs from what the palette gives.
  {
    const d = derived()
    const values = {
      headerTextColor: [colorOf('HeaderStyle-Main', '-ios-text-color'), d.header.text],
      inputBackground: [colorOf('InputBarStyle-Chat', 'background-color'), d.inputBar.background],
      sendBackground: [colorOf('InputBarStyle-Chat', '-ios-send-normal-background-color'), d.inputBar.sendBackground],
      sendIcon: [colorOf('InputBarStyle-Chat', '-ios-send-normal-foreground-color'), d.inputBar.sendIcon],
      buttonColor: [colorOf('InputBarStyle-Chat', '-ios-button-normal-foreground-color'), d.inputBar.button],
    } as const
    if (Object.values(values).some(([v, def]) => !sameColor(v, def))) {
      config.headerInput.mode = 'color'
      for (const [key, [v, def]] of Object.entries(values)) config.headerInput[key as keyof typeof values] = v ?? def
    }
  }

  // 말풍선
  for (const [key, selector] of [['send', 'MessageCellStyle-Send'], ['receive', 'MessageCellStyle-Receive']] as const) {
    const b = config.bubbles[key]
    const mainRef = refOf(selector, '-ios-background-image')
    const groupRef = refOf(selector, '-ios-group-background-image')
    const insets = insetsOf(selector, '-ios-title-edgeinsets')
    const groupInsets = insetsOf(selector, '-ios-group-title-edgeinsets') ?? insets
    const main = await load(mainRef)
    if (insets) b.advanced.insets = insets
    if (main && mainRef) {
      const { summary: s } = main
      const square = Math.abs(s.width - s.height) <= 1
      const centered = mainRef.x === null || (Math.abs(mainRef.x - main.widthPt / 2) <= 1 && Math.abs((mainRef.y ?? 0) - main.heightPt / 2) <= 1)
      if (s.solid && square && centered) {
        // A plain rounded rectangle (what this app and many color themes generate): keep it editable as a color bubble.
        const radius = Math.min(BUBBLE_RADIUS_MAX, Math.round(s.cornerClear / main.scale / DIAGONAL_PER_RADIUS))
        Object.assign(b, { shape: radius < 1 ? 'square' : 'rounded', radius: radius < 1 ? b.radius : radius })
        if (s.solid !== derived().bubbles[key].color) Object.assign(b, { mode: 'color', color: s.solid })
      } else {
        const layout = (ref: ImageRef, img: Loaded, padding: EdgeInsets | null): BubbleImageLayout => ({
          insets: padding ?? b.advanced.insets,
          stretch: ref.x !== null && ref.y !== null ? { x: ref.x, y: ref.y } : null,
          imageSize: Math.min(BUBBLE_IMAGE_SIZE_MAX, Math.round(300 / img.scale)),
        })
        const first = layout(mainRef, main, insets)
        Object.assign(b, { mode: 'image', imageAssetId: main.id })
        Object.assign(b.advanced, first)
        const group = groupRef && (await load(groupRef))
        if (group && groupRef) {
          const second = layout(groupRef, group, groupInsets)
          // The editor keeps a separate 연속 메시지 layout only with its own image slot, so a
          // different layout on the same file is stored as that file in the group slot.
          if (group.id !== main.id || JSON.stringify(second) !== JSON.stringify(first)) {
            b.advanced.groupImageAssetId = group.id
            b.advanced.group = second
          }
        }
      }
    }
    const textColor = colorOf(selector, '-ios-text-color')
    if (textColor && textColor !== derived().bubbles[key].textColor) b.textColor = textColor
  }

  // 기본 프로필 (the property may list several images; the app uses the first).
  const profile = await load(refOf('DefaultProfileStyle', '-ios-profile-images'))
  if (profile) Object.assign(config.profile, { mode: 'image', imageAssetId: profile.id, focus: centerFocus() })

  // 테마 아이콘
  const iconBlob = await archive.themeIcon()
  const icon = iconBlob && (await addImage(iconBlob, 'commonIcoTheme.png'))
  if (icon) Object.assign(config.themeIcon, { mode: 'image', imageAssetId: icon.id })

  // 탭
  {
    const tab = 'TabBarStyle-Main'
    const barImage = await load(refOf(tab, '-ios-background-image'))
    if (barImage && !barImage.summary.solid) notes.add('탭 바 배경 이미지는 지원하지 않아 색으로 바뀌었어요.')
    config.tabs.barColor = barImage?.summary.solid ?? colorOf(tab, 'background-color')
    const iconRef = (cssKeys: readonly string[], state: 'normal' | 'selected') =>
      cssKeys.map((k) => refOf(tab, `-ios-${k}-${state}-icon-image`)).find(Boolean) ?? null
    for (const key of TAB_KEYS as readonly TabKey[]) {
      const normal = await load(iconRef(TAB_CSS_KEYS[key], 'normal'))
      const selected = await load(iconRef(TAB_CSS_KEYS[key], 'selected'))
      if (!normal && !selected) continue
      config.tabs.mode = 'image'
      config.tabs.icons[key] = { normal: (normal ?? selected)!.id, selected: selected?.id ?? null }
    }
    const extra = Object.keys(UNSUPPORTED_TABS).filter((k) => refOf(tab, `-ios-${k}-normal-icon-image`))
    if (extra.length) notes.add(`${extra.map((k) => UNSUPPORTED_TABS[k]).join('·')} 탭 아이콘은 지원하지 않아 빠졌어요.`)
  }

  // 암호
  {
    const pc = config.passcode
    await readFill('BackgroundStyle-Passcode', pc.background, () => derived().passcode.background.color)
    const override = (value: HexColor | null, current: () => HexColor) => (value && value !== current() ? value : null)
    pc.titleColor = override(colorOf('LabelStyle-PasscodeTitle', '-ios-text-color'), () => derived().passcode.title)
    pc.keypadTextColor = override(colorOf('PasscodeStyle', '-ios-keypad-text-normal-color'), () => derived().passcode.keypadText)
    pc.keypadBackground = override(colorOf('PasscodeStyle', '-ios-keypad-background-color'), () => derived().passcode.keypadBackground)

    const pressed = await load(refOf('PasscodeStyle', '-ios-keypad-number-highlighted-image'))
    if (pressed && !pressed.summary.solid) notes.add('키패드 눌림 이미지는 지원하지 않아 색으로 바뀌었어요.')
    pc.pressedColor = override(pressed?.summary.solid ?? null, () => derived().passcode.pressed)

    const normal = await Promise.all(ORDINALS.map((o) => load(refOf('PasscodeStyle', `-ios-bullet-${o}-image`))))
    const selected = await Promise.all(ORDINALS.map((o) => load(refOf('PasscodeStyle', `-ios-bullet-selected-${o}-image`))))
    const oneColor = (list: (Loaded | null)[]) => {
      const colors = new Set(list.map((l) => l?.summary.solid ?? null))
      return colors.size === 1 ? [...colors][0] : null
    }
    const empty = oneColor(normal)
    const filled = oneColor(selected)
    if (empty && filled) {
      // Plain dots: keep them generated so they follow color changes.
      const bullets = derived().passcode.bullets
      if (bullets.kind === 'generated') {
        pc.bullets.emptyColor = empty !== bullets.emptyColor ? empty : null
        pc.bullets.filledColor = filled !== bullets.filledColor ? filled : null
      }
    } else if ([...normal, ...selected].some(Boolean)) {
      // Each missing state falls back to the other one of the same digit.
      const n = normal.map((l, i) => (l ?? selected[i])?.id ?? null)
      const s = selected.map((l, i) => (l ?? normal[i])?.id ?? null)
      if ([...n, ...s].every(Boolean)) Object.assign(pc.bullets, { mode: 'image', normal: n, selected: s })
      else notes.add('암호 표시 이미지가 일부 없어 기본 모양으로 바뀌었어요.')
    }
  }

  if (refOf('ButtonStyle-AddFriend', '-ios-image')) notes.add('친구 추가 버튼 이미지는 지원하지 않아 빠졌어요.')
  if (missing.size) notes.add(`읽지 못한 이미지가 있어 기본값으로 바뀐 항목이 있어요: ${[...missing].sort().join(', ')}`)

  // Solid images that became colors are not part of the project.
  const used = collectAssetIds(config)
  for (const id of images.keys()) if (!used.has(id)) images.delete(id)

  return {
    name: unquote(raw('ManifestStyle', '-kakaotalk-theme-name') ?? ''),
    config,
    images,
    notes: [...notes],
  }
}
