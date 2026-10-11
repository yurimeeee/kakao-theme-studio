import { BatteryFull, Compass, MessageCircle, MoreHorizontal, ShoppingBag, Signal, UserRound, Wifi } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { useAssetUrl } from '@/assets/useAssetUrl'
import { mix } from '@/domain/theme/color'
import type { ResolvedBubble, ResolvedTheme } from '@/domain/theme/resolve'
import type { HexColor, TabKey } from '@/domain/theme/types'
import { effectiveRadius, imageBubbleGeometry } from '@/exporters/ktheme/bubbleGeometry'
import { useEditor } from '../editor/store'

export function StatusBar({ color }: { color: HexColor }) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between px-6 pt-1 text-[12px] font-semibold" style={{ color }} aria-hidden>
      <span>10:21</span>
      <span className="absolute left-1/2 top-2.5 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-black" />
      <span className="flex items-center gap-1">
        <Signal className="size-3.5" strokeWidth={2.5} />
        <Wifi className="size-3.5" strokeWidth={2.5} />
        <BatteryFull className="size-4" strokeWidth={2} />
      </span>
    </div>
  )
}

/** Squircle-ish avatar. `photo` = friend has their own picture; otherwise the theme default profile. */
export function Avatar({ theme, photo, size = 40 }: { theme: ResolvedTheme; photo?: 'a' | 'b' | 'c'; size?: number }) {
  const url = useAssetUrl(theme.profileImageAssetId)
  const radius = size * 0.4
  if (photo) {
    return <PhotoPlaceholder variant={photo} size={size} radius={radius} />
  }
  const bg = mix(theme.palette.background, theme.palette.text, 0.1)
  const fg = mix(theme.palette.background, theme.palette.text, 0.35)
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden"
      style={{ width: size, height: size, borderRadius: radius, background: bg }}
      data-testid="default-profile"
    >
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <UserRound style={{ color: fg, width: size * 0.55, height: size * 0.55 }} fill={fg} strokeWidth={0} />}
    </span>
  )
}

const PHOTO_COLORS = {
  a: ['#c9d3dc', '#8e9aa6', '#f1efe9'],
  b: ['#ddd3c8', '#a3917f', '#f6f1ea'],
  c: ['#cfd6cf', '#8d978d', '#eef1ee'],
} as const

/** Neutral stand-in for a friend's own photo (flat shapes, not a real person or character). */
function PhotoPlaceholder({ variant, size, radius }: { variant: 'a' | 'b' | 'c'; size: number; radius: number }) {
  const [sky, hill, sun] = PHOTO_COLORS[variant]
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ borderRadius: radius }} className="shrink-0" aria-hidden data-testid="friend-photo">
      <rect width="40" height="40" fill={sky} />
      <circle cx="28" cy="12" r="5" fill={sun} />
      <path d="M0 40 L0 28 L12 18 L22 27 L29 21 L40 30 L40 40 Z" fill={hill} />
    </svg>
  )
}

const TAB_ORDER: { key: TabKey; label: string; icon: typeof UserRound }[] = [
  { key: 'friends', label: '친구', icon: UserRound },
  { key: 'chats', label: '채팅', icon: MessageCircle },
  { key: 'now', label: '지금', icon: Compass },
  { key: 'shopping', label: '쇼핑', icon: ShoppingBag },
  { key: 'more', label: '더보기', icon: MoreHorizontal },
]

function TabIcon({ theme, tab, active }: { theme: ResolvedTheme; tab: (typeof TAB_ORDER)[number]; active: boolean }) {
  const pair = theme.tabs.icons[tab.key]
  const url = useAssetUrl(pair ? (active ? pair.selected : pair.normal) : null)
  const Icon = tab.icon
  if (url) return <img src={url} alt="" className="size-7 object-contain" />
  return <Icon className="size-[22px]" style={{ color: active ? theme.tabs.tintSelected : theme.tabs.tintNormal }} strokeWidth={active ? 2.4 : 1.8} />
}

export function TabBar({ theme, active }: { theme: ResolvedTheme; active: TabKey }) {
  return (
    <nav
      aria-label="하단 탭 미리보기"
      className="flex h-[62px] shrink-0 items-start justify-around px-2 pt-2.5"
      style={{ background: theme.tabs.barColor ?? theme.main.background.color, borderTop: `1px solid ${theme.main.sectionBorder}` }}
    >
      {TAB_ORDER.map((t) => (
        <span key={t.key} className="flex size-8 items-center justify-center">
          <TabIcon theme={theme} tab={t} active={t.key === active} />
        </span>
      ))}
    </nav>
  )
}

export function HomeIndicator({ color }: { color: HexColor }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center" aria-hidden>
      <span className="h-[5px] w-[110px] rounded-full opacity-80" style={{ background: color }} />
    </div>
  )
}

/** Bubble preview. Generated bubbles use the same radius rule as the exporter; image bubbles use border-image with the export stretch point. */
export function Bubble({ bubble, children }: { bubble: ResolvedBubble; children: ReactNode }) {
  const url = useAssetUrl(bubble.imageAssetId)
  const record = useEditor((s) => (bubble.imageAssetId ? s.assets.get(bubble.imageAssetId) : undefined))
  const { insets } = bubble
  const base: CSSProperties = {
    padding: `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`,
    color: bubble.textColor,
    fontSize: 13,
    lineHeight: '17px',
    maxWidth: 196,
    overflowWrap: 'anywhere',
  }
  if (bubble.kind === 'image' && url && record) {
    const g = imageBubbleGeometry(record.width, record.height, bubble.stretch)
    const top = g.stretch.y
    const left = g.stretch.x
    const bottom = Math.max(0, g.heightPt - g.stretch.y - 1)
    const right = Math.max(0, g.widthPt - g.stretch.x - 1)
    return (
      <div
        style={{
          ...base,
          borderStyle: 'solid',
          borderWidth: 0,
          borderImageSource: `url("${url}")`,
          borderImageSlice: `${top * 3} ${right * 3} ${bottom * 3} ${left * 3} fill`,
          borderImageWidth: `${top}px ${right}px ${bottom}px ${left}px`,
          borderImageRepeat: 'stretch',
          minWidth: g.widthPt,
          minHeight: g.heightPt,
        }}
      >
        {children}
      </div>
    )
  }
  return <div style={{ ...base, background: bubble.color, borderRadius: effectiveRadius(bubble) }}>{children}</div>
}
