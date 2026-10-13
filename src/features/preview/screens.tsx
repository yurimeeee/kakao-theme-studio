import { ChevronLeft, Delete, Menu, MessageCirclePlus, Plus, Search, Send, Settings, Smile, UserPlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAssetUrl } from '@/assets/useAssetUrl'
import type { ResolvedTheme } from '@/domain/theme/resolve'
import { Avatar, Bubble, TabBar } from './parts'

const FRIENDS: { name: string; status?: string; photo?: 'a' | 'b' | 'c' }[] = [
  { name: '지우', status: '오늘도 좋은 하루', photo: 'a' },
  { name: '수민' },
  { name: '하린', status: '산책 중', photo: 'b' },
  { name: '민서', status: '바쁨' },
  { name: '도윤', photo: 'c' },
  { name: '서연' },
]

/** Chat list names are fixed by the spec. No official character art is used. */
const CHATS: { name: string; message: string; time: string; photo?: 'a' | 'b' | 'c' }[] = [
  { name: '라이언', message: '새 테마 완성하면 보여줘!', time: '오후 2:14' },
  { name: '어피치', message: '사진 보냈어', time: '오후 1:02', photo: 'b' },
  { name: '무지', message: '내일 몇 시에 만날까?', time: '오전 11:30' },
  { name: '튜브', message: '좋아요 👍', time: '오전 9:41', photo: 'a' },
  { name: '프로도', message: '파일 확인 부탁해요', time: '어제' },
  { name: '네오', message: '고마워!', time: '어제', photo: 'c' },
]

function HeaderIcons({ color, icons }: { color: string; icons: typeof Search[] }) {
  return (
    <span className="flex items-center gap-3" style={{ color }} aria-hidden>
      {icons.map((Icon, i) => (
        <Icon key={i} className="size-[19px]" strokeWidth={1.8} />
      ))}
    </span>
  )
}

export function FriendsScreen({ theme }: { theme: ResolvedTheme }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between px-4 pb-2 pt-1">
        <h4 className="text-[20px] font-bold" style={{ color: theme.header.text }}>
          친구
        </h4>
        <HeaderIcons color={theme.header.text} icons={[Search, UserPlus, Settings]} />
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2">
          <Avatar theme={theme} size={48} />
          <div>
            <p className="text-[14px] font-semibold" style={{ color: theme.main.title }}>
              나
            </p>
            <p className="text-[11px]" style={{ color: theme.main.description }}>
              상태메시지를 입력해 보세요
            </p>
          </div>
        </div>
        <div className="mx-4 mt-1 border-t pb-1 pt-2.5 text-[11px]" style={{ borderColor: theme.main.sectionBorder, color: theme.main.description }}>
          친구 {FRIENDS.length}
        </div>
        <ul>
          {FRIENDS.map((f) => (
            <li key={f.name} className="flex items-center gap-3 px-4 py-[7px]">
              <Avatar theme={theme} photo={f.photo} size={38} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium" style={{ color: theme.main.title }}>
                  {f.name}
                </p>
                {f.status && (
                  <p className="truncate text-[11px]" style={{ color: theme.main.description }}>
                    {f.status}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <TabBar theme={theme} active="friends" />
    </div>
  )
}

export function ChatListScreen({ theme }: { theme: ResolvedTheme }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between px-4 pb-2 pt-1">
        <h4 className="text-[20px] font-bold" style={{ color: theme.header.text }}>
          채팅
        </h4>
        <HeaderIcons color={theme.header.text} icons={[Search, MessageCirclePlus, Settings]} />
      </header>
      <ul className="min-h-0 flex-1 overflow-hidden">
        {CHATS.map((c) => (
          <li key={c.name} className="flex items-center gap-3 px-4 py-[7px]">
            <Avatar theme={theme} photo={c.photo} size={42} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-[13px] font-semibold" style={{ color: theme.main.title }}>
                  {c.name}
                </p>
                <span className="shrink-0 text-[10px]" style={{ color: theme.main.description }}>
                  {c.time}
                </span>
              </div>
              <p className="truncate text-[11.5px]" style={{ color: theme.main.paragraph }}>
                {c.message}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <TabBar theme={theme} active="chats" />
    </div>
  )
}

export function ChatRoomScreen({ theme }: { theme: ResolvedTheme }) {
  const sub = theme.palette.subText
  const time = (t: string) => (
    <span className="shrink-0 self-end text-[9.5px]" style={{ color: sub }}>
      {t}
    </span>
  )
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between px-3 pb-2 pt-1" style={{ color: theme.header.text }}>
        <ChevronLeft className="size-5" aria-hidden />
        <h4 className="text-[15px] font-semibold">라이언</h4>
        <Menu className="size-5" aria-hidden />
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden px-3 pt-2">
        <p className="mb-1 self-center rounded-full px-3 py-0.5 text-[10px]" style={{ color: sub, background: 'rgb(0 0 0 / 0.06)' }}>
          10월 11일 일요일
        </p>
        <div className="flex gap-2">
          <Avatar theme={theme} size={34} />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px]" style={{ color: theme.palette.text }}>
              라이언
            </span>
            <div className="flex items-end gap-1">
              <Bubble bubble={theme.bubbles.receive}>오늘 하루는 어땠어?</Bubble>
            </div>
            <div className="flex items-end gap-1">
              <Bubble bubble={theme.bubbles.receive} group>
                나는 새 테마를 만들고 있어
              </Bubble>
              {time('오후 2:10')}
            </div>
          </div>
        </div>
        <div className="mt-1 flex flex-col items-end gap-1">
          <div className="flex items-end gap-1">
            {time('')}
            <Bubble bubble={theme.bubbles.send}>좋아!</Bubble>
          </div>
          <div className="flex items-end gap-1">
            {time('오후 2:12')}
            <Bubble bubble={theme.bubbles.send} group>말풍선이 길어지면 이렇게 여러 줄로 보여요. 모서리와 여백을 함께 확인해 보세요.</Bubble>
          </div>
        </div>
        <div className="mt-1 flex gap-2">
          <Avatar theme={theme} photo="a" size={34} />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px]" style={{ color: theme.palette.text }}>
              튜브
            </span>
            <div className="flex items-end gap-1">
              <Bubble bubble={theme.bubbles.receive}>사진 있는 친구는 그대로예요</Bubble>
              {time('오후 2:14')}
            </div>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 px-2.5 pb-6 pt-2" style={{ background: theme.inputBar.background }}>
        <Plus className="size-5 shrink-0" style={{ color: theme.inputBar.button }} aria-hidden />
        <div className="flex h-8 min-w-0 flex-1 items-center rounded-full px-3 text-[11px]" style={{ background: 'rgb(127 127 127 / 0.1)', color: theme.palette.subText }}>
          메시지 입력
        </div>
        <Smile className="size-5 shrink-0" style={{ color: theme.inputBar.button }} aria-hidden />
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full" style={{ background: theme.inputBar.sendBackground }} aria-hidden>
          <Send className="size-4" style={{ color: theme.inputBar.sendIcon }} />
        </span>
      </div>
    </div>
  )
}

function BulletImage({ id }: { id: string }) {
  const url = useAssetUrl(id)
  return url ? <img src={url} alt="" className="size-7 object-contain" /> : <span className="size-7" />
}

/**
 * Passcode preview with a keypad simulation. Digits exist only in this component's
 * memory as a count — nothing is stored, logged or sent.
 */
export function PasscodeScreen({ theme }: { theme: ResolvedTheme }) {
  const [count, setCount] = useState(0)
  const [pressed, setPressed] = useState<string | null>(null)
  const resetTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(resetTimer.current), [])
  const { bullets } = theme.passcode

  const press = (key: string) => {
    if (key === 'cancel') return setCount(0)
    if (key === 'delete') return setCount((c) => Math.max(0, c - 1))
    setCount((c) => {
      const next = Math.min(4, c + 1)
      if (next === 4) resetTimer.current = window.setTimeout(() => setCount(0), 600)
      return next
    })
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'cancel', '0', 'delete']
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center">
      <div className="mt-10 flex flex-col items-center gap-1.5 px-6 text-center">
        <h4 className="text-[17px] font-semibold" style={{ color: theme.passcode.title }}>
          암호 입력
        </h4>
        <p className="text-[12px]" style={{ color: theme.passcode.title }}>
          카카오톡 암호를 입력해 주세요.
        </p>
      </div>
      <div className="mt-7 flex gap-4" role="status" aria-label={`암호 ${count}자리 입력됨`}>
        {[0, 1, 2, 3].map((i) =>
          bullets.kind === 'image' ? (
            <BulletImage key={i} id={i < count ? bullets.selected[i] : bullets.normal[i]} />
          ) : (
            <span key={i} className="flex size-7 items-center justify-center">
              <span className="size-4 rounded-full" style={{ background: i < count ? bullets.filledColor : bullets.emptyColor }} />
            </span>
          ),
        )}
      </div>
      <div className="mt-auto grid w-full grid-cols-3 gap-y-1 px-6 pb-8 pt-4" style={{ background: theme.passcode.keypadBackground === theme.passcode.background.color ? undefined : theme.passcode.keypadBackground }}>
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onPointerDown={() => setPressed(k)}
            onPointerUp={() => setPressed(null)}
            onPointerLeave={() => setPressed(null)}
            onClick={() => press(k)}
            aria-label={k === 'cancel' ? '취소' : k === 'delete' ? '삭제' : `숫자 ${k}`}
            className="relative flex h-12 items-center justify-center text-[22px] outline-offset-0"
            style={{ color: theme.passcode.keypadText }}
          >
            {pressed === k && k !== 'cancel' && k !== 'delete' && (
              <span className="absolute size-12 rounded-full" style={{ background: theme.passcode.pressed }} aria-hidden />
            )}
            <span className="relative text-[inherit]">
              {k === 'cancel' ? <span className="text-[13px]">취소</span> : k === 'delete' ? <Delete className="size-5" /> : k}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
