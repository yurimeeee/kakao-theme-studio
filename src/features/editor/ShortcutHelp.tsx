import { Fragment } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { isMac, KEYS } from './shortcuts'

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {keys.map((k, i) => (
        <Fragment key={i}>
          {!isMac && i > 0 && <span className="text-[12px] text-sub">+</span>}
          <kbd className="inline-flex h-7 min-w-7 items-center justify-center rounded-[8px] bg-canvas px-2 font-sans text-[13px] font-medium text-ink shadow-[inset_0_-1px_0_rgb(0_0_0/0.08)]">
            {k}
          </kbd>
        </Fragment>
      ))}
    </span>
  )
}

const SHORTCUTS: { label: string; keys: string[]; note?: string }[] = [
  { label: '실행 취소', keys: KEYS.undo },
  { label: '다시 실행', keys: KEYS.redo, note: isMac ? undefined : 'Ctrl+Shift+Z도 돼요' },
  { label: '이 도움말', keys: ['?'] },
]

const TIPS: [string, string][] = [
  ['미리보기 누르기', '누른 말풍선·입력창·배경 같은 요소의 속성이 바로 열려요.'],
  ['이미지 위치', '틀 안의 이미지를 끌거나, 틀을 고른 뒤 방향키로 옮겨요.'],
  ['슬라이더 · 선택 버튼', '고른 뒤 방향키로 한 칸씩 바꿔요.'],
  ['실행 취소 단위', '같은 설정을 연달아 바꾸면 한 번에 되돌려요. 글자 입력칸 안에서는 그 칸의 입력만 되돌려요.'],
]

export function ShortcutHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="단축키와 조작법">
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] text-sub">단축키</h3>
        <ul className="flex flex-col">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex min-h-11 items-center justify-between gap-3 border-b border-hair last:border-b-0">
              <span className="text-[14px] text-ink">
                {s.label}
                {s.note && <span className="ml-2 text-[12px] text-sub">{s.note}</span>}
              </span>
              <Keys keys={s.keys} />
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] text-sub">조작법</h3>
        <dl className="flex flex-col gap-3">
          {TIPS.map(([term, text]) => (
            <div key={term}>
              <dt className="text-[14px] font-medium text-ink">{term}</dt>
              <dd className="text-[13px] leading-relaxed text-sub">{text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Dialog>
  )
}
