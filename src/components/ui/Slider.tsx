import * as RadixSlider from '@radix-ui/react-slider'
import { useId } from 'react'

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  disabled?: boolean
  onChange: (value: number) => void
}

export function Slider({ label, value, min, max, step = 1, unit = 'px', disabled, onChange }: SliderProps) {
  const id = useId()
  return (
    <div className={disabled ? 'opacity-40' : undefined}>
      <div className="mb-2 flex items-center justify-between text-[13px]">
        <span id={id} className="text-sub">
          {label}
        </span>
        <span className="tabular-nums text-ink">
          {value} {unit}
        </span>
      </div>
      <RadixSlider.Root
        className="relative flex h-11 w-full touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([v]) => onChange(v)}
        aria-labelledby={id}
      >
        <RadixSlider.Track className="relative h-1.5 grow rounded-full bg-canvas-strong">
          <RadixSlider.Range className="absolute h-full rounded-full bg-ink" />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          aria-labelledby={id}
          className="block size-6 rounded-full border border-hair bg-surface shadow-[0_1px_4px_rgb(0_0_0/0.15)]"
        />
      </RadixSlider.Root>
    </div>
  )
}
