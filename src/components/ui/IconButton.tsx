import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from './cn'
import { Spinner } from './Spinner'
import { Tooltip } from './Tooltip'

type Variant = 'soft' | 'solid' | 'surface' | 'ghost'

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Korean accessible name; also shown as tooltip. */
  label: string
  icon: ReactNode
  variant?: Variant
  size?: 'md' | 'lg'
  busy?: boolean
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right'
}

const variants: Record<Variant, string> = {
  soft: 'bg-canvas text-ink hover:bg-canvas-strong',
  solid: 'bg-ink text-white hover:bg-ink-soft',
  surface: 'bg-surface text-ink hover:bg-canvas-strong',
  ghost: 'bg-transparent text-ink hover:bg-canvas',
}

/** Circular icon action with Korean tooltip and aria-label (≥44px touch target). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'soft', size = 'md', busy, disabled, className, tooltipSide, ...rest },
  ref,
) {
  return (
    <Tooltip label={label} side={tooltipSide}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-busy={busy || undefined}
        disabled={disabled || busy}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40',
          size === 'lg' ? 'size-12' : 'size-11',
          variants[variant],
          className,
        )}
        {...rest}
      >
        {busy ? <Spinner /> : icon}
      </button>
    </Tooltip>
  )
})
