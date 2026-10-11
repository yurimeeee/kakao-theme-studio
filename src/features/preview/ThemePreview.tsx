import { useEffect, useMemo, useRef, useState } from 'react'
import { SCREEN_LABELS } from '../editor/elements'
import { resolveTheme } from '@/domain/theme/resolve'
import type { PreviewScreen, ThemeConfig } from '@/domain/theme/types'
import { HomeIndicator, StatusBar } from './parts'
import { useFillStyle } from './useFillStyle'
import { ChatListScreen, ChatRoomScreen, FriendsScreen, PasscodeScreen } from './screens'

const PHONE_W = 300
const PHONE_H = 630

/**
 * KakaoTalk-like preview rendered from the same ResolvedTheme as the exporter.
 * Drawn at a fixed logical size and scaled to fit, so 320px screens keep layout.
 */
export function ThemePreview({ config, screen }: { config: ThemeConfig; screen: PreviewScreen }) {
  const theme = useMemo(() => resolveTheme(config), [config])
  const hostRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      // Width only: the host's height follows the scaled phone, so using it would feed back.
      const s = Math.min(1, entry.contentRect.width / PHONE_W)
      setScale(Math.max(0.6, Number(s.toFixed(3))))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const statusColor = screen === 'passcode' ? theme.passcode.title : theme.header.text
  const fill = screen === 'chatroom' ? theme.chatroom.background : screen === 'passcode' ? theme.passcode.background : theme.main.background
  const fillStyle = useFillStyle(fill)
  return (
    <div ref={hostRef} className="flex w-full justify-center">
      <div style={{ width: PHONE_W * scale, height: PHONE_H * scale }}>
        <div
          role="group"
          aria-label={`카카오톡 테마 미리보기: ${SCREEN_LABELS[screen]}`}
          data-testid="theme-preview"
          className="relative flex origin-top-left flex-col overflow-hidden rounded-[40px] border-[6px] border-white bg-white shadow-[var(--shadow-phone)]"
          style={{ width: PHONE_W, height: PHONE_H, transform: `scale(${scale})` }}
        >
          <div className="relative flex min-h-0 flex-1 flex-col" style={fillStyle}>
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
