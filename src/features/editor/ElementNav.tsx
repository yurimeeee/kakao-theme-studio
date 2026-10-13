import { cn } from '@/components/ui/cn'
import type { ElementKey } from '@/domain/theme/types'
import { ELEMENT_ORDER, ELEMENTS } from './elements'

/** Desktop: grouped list of editable elements. */
export function ElementNav({ selected, onSelect }: { selected: ElementKey; onSelect: (k: ElementKey) => void }) {
  const group = (g: 'theme' | 'common', title: string) => (
    <div className="flex flex-col gap-1">
      <p className="px-3 pb-1 text-[12px] text-faint">{title}</p>
      {ELEMENT_ORDER.filter((k) => ELEMENTS[k].group === g).map((k) => {
        const { icon: Icon, label } = ELEMENTS[k]
        return (
          <button
            key={k}
            type="button"
            onClick={() => onSelect(k)}
            aria-current={selected === k ? 'true' : undefined}
            className={cn(
              'flex min-h-12 items-center gap-3 rounded-[18px] px-3 text-left text-[14px] transition-colors',
              selected === k ? 'bg-canvas font-semibold text-ink' : 'text-ink-soft hover:bg-canvas',
            )}
          >
            <Icon className="size-[18px] shrink-0 text-sub" aria-hidden />
            {label}
          </button>
        )
      })}
    </div>
  )
  return (
    <nav aria-label="편집 요소" className="flex flex-col gap-6">
      {group('theme', '테마 구성')}
      {group('common', '공통 리소스')}
    </nav>
  )
}

/** Mobile: horizontal chips; selecting one opens the property sheet. */
export function ElementChips({ selected, onSelect }: { selected: ElementKey | null; onSelect: (k: ElementKey) => void }) {
  return (
    <nav aria-label="편집 요소" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {ELEMENT_ORDER.map((k) => {
        const { icon: Icon, label } = ELEMENTS[k]
        return (
          <button
            key={k}
            type="button"
            onClick={() => onSelect(k)}
            aria-haspopup="dialog"
            className={cn(
              'flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-medium transition-colors',
              selected === k ? 'bg-ink text-white' : 'bg-canvas text-ink hover:bg-canvas-strong',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        )
      })}
    </nav>
  )
}
