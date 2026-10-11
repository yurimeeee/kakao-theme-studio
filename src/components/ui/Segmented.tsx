import { useId, useRef, type KeyboardEvent } from 'react'
import { cn } from './cn'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  className?: string
  /** Hide the visible label (still used as accessible name). */
  hideLabel?: boolean
}

/** Capsule single-choice control (ARIA radiogroup with arrow-key navigation). */
export function Segmented<T extends string>({ label, value, options, onChange, size = 'md', className, hideLabel }: SegmentedProps<T>) {
  const id = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const enabled = options.filter((o) => !o.disabled)

  const onKeyDown = (e: KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const idx = enabled.findIndex((o) => o.value === value)
    const next = enabled[(idx + dir + enabled.length) % enabled.length]
    onChange(next.value)
    refs.current[options.indexOf(next)]?.focus()
  }

  return (
    <div className={className}>
      {!hideLabel && (
        <div id={id} className="mb-2 text-[13px] text-sub">
          {label}
        </div>
      )}
      <div
        role="radiogroup"
        aria-labelledby={hideLabel ? undefined : id}
        aria-label={hideLabel ? label : undefined}
        onKeyDown={onKeyDown}
        className="flex w-full gap-1 rounded-full bg-canvas p-1"
      >
        {options.map((o, i) => {
          const active = o.value === value
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              disabled={o.disabled}
              onClick={() => onChange(o.value)}
              className={cn(
                'min-w-0 flex-1 truncate whitespace-nowrap rounded-full font-medium transition-colors disabled:opacity-40',
                size === 'sm' ? 'min-h-9 px-1 text-[12.5px] sm:px-2 sm:text-[13px]' : 'min-h-11 px-2 text-[14px]',
                active ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]' : 'text-sub hover:text-ink',
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
