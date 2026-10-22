import { Pipette } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { contrastRatio, normalizeHex, readableOn } from '@/domain/theme/color'
import type { HexColor } from '@/domain/theme/types'
import { cn } from './cn'
import { IconButton } from './IconButton'
import { useRecentColors } from './recentColors'

/** Chromium's EyeDropper (not in Safari/Firefox yet); typed here because lib.dom lacks it. */
interface EyeDropperApi {
  open(): Promise<{ sRGBHex: string }>
}
const eyeDropper = (): (new () => EyeDropperApi) | null =>
  typeof window !== 'undefined' && 'EyeDropper' in window ? (window as unknown as { EyeDropper: new () => EyeDropperApi }).EyeDropper : null

interface ColorFieldProps {
  label: string
  value: HexColor
  onChange: (value: HexColor) => void
  swatches?: HexColor[]
  /** When provided, the field can follow an inherited value ("자동"). */
  auto?: { active: boolean; onReset: () => void; label?: string }
  /** Warn when this color is hard to read on `against` (WCAG ratio below `min`). */
  contrast?: { against: HexColor; min: number }
  disabled?: boolean
}

/**
 * Color picker + hex input + eyedropper (where supported) + quick swatches + 최근 색.
 * Invalid hex never reaches the config. A color counts as recent once it is settled: picked
 * from a swatch or the eyedropper, the system picker closed, or a full #RRGGBB typed.
 */
export function ColorField({ label, value, onChange, swatches, auto, contrast, disabled }: ColorFieldProps) {
  const id = useId()
  // Text being typed; null = show the committed value.
  const [draft, setDraft] = useState<string | null>(null)
  const invalid = draft !== null && normalizeHex(draft) === null
  const text = draft ?? value
  const ratio = contrast ? contrastRatio(value, contrast.against) : null
  const lowContrast = contrast && ratio !== null && ratio < contrast.min
  const recent = useRecentColors((s) => s.colors)
  const remember = useRecentColors((s) => s.remember)
  const [dropper] = useState(eyeDropper)

  // React's onChange fires on every drag step of the system picker; `change` fires once when it closes.
  const picker = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = picker.current
    if (!el) return
    const settled = () => remember(el.value.toLowerCase())
    el.addEventListener('change', settled)
    return () => el.removeEventListener('change', settled)
  }, [remember])

  const choose = (hex: HexColor) => {
    setDraft(null)
    onChange(hex)
    remember(hex)
  }

  const pickFromScreen = async () => {
    if (!dropper) return
    try {
      const hex = normalizeHex((await new dropper().open()).sRGBHex)
      if (hex) choose(hex)
    } catch {
      // Escape or another dismissal: nothing picked.
    }
  }

  const commitText = (raw: string) => {
    setDraft(raw)
    const hex = normalizeHex(raw)
    if (!hex) return
    onChange(hex)
    // A full #RRGGBB is a finished color. Recording it now rather than on blur keeps the 최근
    // row from appearing under the pointer while the click that leaves the field is landing.
    if (/^#?[0-9a-f]{6}$/i.test(raw.trim())) remember(hex)
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
            ref={picker}
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
        {dropper && (
          <IconButton label={`${label} 화면에서 색 집기`} icon={<Pipette className="size-[18px]" />} variant="ghost" className="-mr-2" onClick={() => void pickFromScreen()} />
        )}
      </div>
      {invalid && (
        <p id={`${id}-err`} role="alert" className="text-[12px] text-danger">
          #RRGGBB 형식으로 입력해 주세요.
        </p>
      )}
      {lowContrast && (
        <div className="flex items-center justify-between gap-2 rounded-[var(--radius-field)] bg-canvas py-1.5 pl-4 pr-1.5" data-testid="contrast-warning">
          <p className="text-[12px] leading-snug text-ink">
            배경과 비슷해 잘 안 보일 수 있어요
            <span className="text-sub tabular-nums"> · 대비 {ratio.toFixed(1)}:1</span>
          </p>
          <button
            type="button"
            onClick={() => onChange(readableOn(contrast.against, value, contrast.min))}
            className="min-h-8 shrink-0 rounded-full bg-surface px-3 text-[12px] font-medium text-ink hover:bg-canvas-strong"
          >
            읽기 쉬운 색으로
          </button>
        </div>
      )}
      {swatches && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={`${label} 추천 색상`}>
          {swatches.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => choose(s)}
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
      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`${label} 최근 사용한 색`}>
          <span className="mr-0.5 text-[12px] text-sub">최근</span>
          {recent.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => choose(c)}
              aria-label={`${c.toUpperCase()} 선택`}
              aria-pressed={c === value}
              className={cn('size-6 rounded-full border border-black/10 transition-shadow', c === value && 'ring-2 ring-ink ring-offset-1')}
              style={{ background: c }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
