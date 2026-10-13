import type { ReactNode } from 'react'
import { Button } from './Button'
import { cn } from './cn'
import { Spinner } from './Spinner'

/** Spinner + message while something loads. `page` fills the main area, `section` a list. */
export function LoadingState({ children, size = 'section' }: { children: ReactNode; size?: 'page' | 'section' }) {
  return (
    <div className={cn('flex items-center justify-center gap-3 text-sub', size === 'page' ? 'min-h-[50dvh]' : 'min-h-40')} role="status">
      <Spinner className={size === 'page' ? 'size-6' : 'size-5'} />
      {children}
    </div>
  )
}

/** A list or section that could not load, with a retry. */
export function ErrorState({ message, detail, onRetry }: { message: ReactNode; detail?: ReactNode; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] bg-canvas px-6 py-12 text-center" role="alert">
      <p className="font-semibold">{message}</p>
      {detail && <p className="text-[14px] text-sub">{detail}</p>}
      <Button variant="surface" onClick={onRetry}>
        다시 시도
      </Button>
    </div>
  )
}

/** Nothing to show yet. `children` is an optional action (rendered below the text). */
export function EmptyState({ title, description, children }: { title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] bg-canvas px-6 py-14 text-center">
      <p className="text-[17px] font-bold">{title}</p>
      {description && <p className="text-[14px] text-sub">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
