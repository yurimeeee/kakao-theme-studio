import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'
import { Spinner } from './Spinner'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'solid' | 'soft' | 'surface' | 'danger'
  busy?: boolean
}

const variants = {
  solid: 'bg-ink text-white hover:bg-ink-soft',
  soft: 'bg-canvas text-ink hover:bg-canvas-strong',
  surface: 'bg-surface text-ink hover:bg-canvas-strong',
  danger: 'bg-danger text-white hover:opacity-90',
}

/** Capsule text button. */
export function Button({ variant = 'solid', busy, disabled, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[14px] font-semibold transition-colors disabled:opacity-40',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {busy && <Spinner />}
      {children}
    </button>
  )
}
