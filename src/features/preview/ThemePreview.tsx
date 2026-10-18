import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { SCREEN_LABELS } from '../editor/elements'
import { resolveThemeCached } from '@/domain/theme/resolve'
import type { ElementKey, PreviewScreen, ThemeConfig } from '@/domain/theme/types'
import { HomeIndicator, StatusBar } from './parts'
import { useFillStyle } from './useFillStyle'
import { ChatListScreen, ChatRoomScreen, FriendsScreen, PasscodeScreen } from './screens'

const PHONE_W = 300
const PHONE_H = 630
/** Screen area inside the 6px phone border. */
const SCREEN = { w: PHONE_W - 12, h: PHONE_H - 12 }

/**
 * KakaoTalk-like preview rendered from the same ResolvedTheme as the exporter.
 * Drawn at a fixed logical size and scaled to fit, so 320px screens keep layout.
 *
 * With `onSelectElement`, clicking a part selects its element: parts carry `data-element`
 * and the innermost one wins. The element list stays the keyboard path.
 */
export function ThemePreview({
  config,
  screen,
  onSelectElement,
  minScale = 0.6,
  fit = 'width',
}: {
  config: ThemeConfig
  screen: PreviewScreen
  onSelectElement?: (k: ElementKey) => void
  /** Smallest scale; lower it where several phones share a row. */
  minScale?: number
  /** `contain`: also fit the height of the host, which must get its height from its parent. */
  fit?: 'width' | 'contain'
}) {
  const theme = resolveThemeCached(config)
  const hostRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      // Width only by default: the host's height follows the scaled phone, so using it would feed back.
      const { width, height } = entry.contentRect
      const s = Math.min(1, width / PHONE_W, fit === 'contain' ? height / PHONE_H : 1)
      setScale(Math.max(minScale, Number(s.toFixed(3))))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [minScale, fit])

  const statusColor = screen === 'passcode' ? theme.passcode.title : theme.header.text
  const fill = screen === 'chatroom' ? theme.chatroom.background : screen === 'passcode' ? theme.passcode.background : theme.main.background
  const fillStyle = useFillStyle(fill, SCREEN)
  const onClick = (e: MouseEvent) => {
    const target = e.target as Element
    // Keypad keys simulate input instead.
    if (!onSelectElement || target.closest('button')) return
    const key = target.closest<HTMLElement>('[data-element]')?.dataset.element
    if (key) onSelectElement(key as ElementKey)
  }
  return (
    <div ref={hostRef} className={fit === 'contain' ? 'flex size-full justify-center overflow-hidden' : 'flex w-full justify-center'}>
      <div style={{ width: PHONE_W * scale, height: PHONE_H * scale }}>
        <div
          role="group"
          aria-label={`카카오톡 테마 미리보기: ${SCREEN_LABELS[screen]}`}
          data-testid="theme-preview"
          data-pickable={onSelectElement ? '' : undefined}
          onClick={onClick}
          className="relative flex origin-top-left flex-col overflow-hidden rounded-[40px] border-[6px] border-white bg-white shadow-[var(--shadow-phone)]"
          style={{ width: PHONE_W, height: PHONE_H, transform: `scale(${scale})` }}
        >
          <div className="relative flex min-h-0 flex-1 flex-col" style={fillStyle} data-element={screen === 'passcode' ? 'passcode' : 'background'}>
            <div className="absolute inset-x-0 top-0 z-10">
              <StatusBar color={statusColor} />
            </div>
            <div className="flex min-h-0 flex-1 flex-col pt-11">
              {screen === 'friends' && <FriendsScreen theme={theme} />}
              {screen === 'chats' && <ChatListScreen theme={theme} />}
              {screen === 'chatroom' && <ChatRoomScreen theme={theme} />}
              {screen === 'passcode' && <PasscodeScreen theme={theme} />}
            </div>
            <HomeIndicator color={statusColor} />
          </div>
        </div>
      </div>
    </div>
  )
}
