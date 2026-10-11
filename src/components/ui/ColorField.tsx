import { useId, useState } from 'react'
import { normalizeHex } from '@/domain/theme/color'
import type { HexColor } from '@/domain/theme/types'
import { cn } from './cn'

interface ColorFieldProps {
  label: string
  value: HexColor
  onChange: (value: HexColor) => void
  swatches?: HexColor[]
  /** When provided, the field can follow an inherited value ("자동"). */
  auto?: { active: boolean; onReset: () => void; label?: string }
  disabled?: boolean
}

/** Color picker + hex input + quick swatches. Invalid hex never reaches the config. */
export function ColorField({ label, value, onChange, swatches, auto, disabled }: ColorFieldProps) {
  const id = useId()
  // Text being typed; null = show the committed value.
  const [draft, setDraft] = useState<string | null>(null)
  const invalid = draft !== null && normalizeHex(draft) === null
  const text = draft ?? value

  const commitText = (raw: string) => {
    setDraft(raw)
    const hex = normalizeHex(raw)
    if (hex) onChange(hex)
  }

  return (
    <div className={cn('flex flex-col gap-2', disabled && 'pointer-events-none opacity-40')}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`${id}-hex`} className="text-[13px] text-sub">
          {label}
        </label>
        {auto && (
          <button
            type="button"
            onClick={auto.onReset}
            disabled={auto.active}
            className="min-h-8 rounded-full px-3 text-[12px] font-medium text-sub hover:bg-canvas disabled:cursor-default disabled:bg-canvas disabled:text-ink"
          >
            {auto.active ? (auto.label ?? '전체 색상 따름') : '전체 색상으로 되돌리기'}
          </button>
        )}
      </div>
      <div className="flex min-h-12 items-center gap-3 rounded-[var(--radius-field)] bg-canvas px-3">
        <span className="relative size-7 shrink-0 overflow-hidden rounded-[9px] border border-black/10" style={{ background: value }}>
          <input
            type="color"
            value={value}
            onChange={(e) => {
              setDraft(null)
              onChange(e.target.value.toLowerCase())
            }}
            aria-label={`${label} 색상 선택`}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </span>
        <input
          id={`${id}-hex`}
          value={text}
          onChange={(e) => commitText(e.target.value)}
          onBlur={() => setDraft(null)}
          spellCheck={false}
          autoComplete="off"
          inputMode="text"
          maxLength={7}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-err` : undefined}
          className="min-w-0 flex-1 bg-transparent text-[14px] uppercase tabular-nums text-ink outline-none"
        />
      </div>
      {invalid && (
        <p id={`${id}-err`} role="alert" className="text-[12px] text-danger">
          #RRGGBB 형식으로 입력해 주세요.
        </p>
      )}
      {swatches && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={`${label} 추천 색상`}>
          {swatches.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              aria-label={`${s.toUpperCase()} 선택`}
              aria-pressed={s === value}
              className={cn(
                'size-9 rounded-full border border-black/10 transition-shadow',
                s === value && 'ring-2 ring-ink ring-offset-2',
              )}
              style={{ background: s }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
