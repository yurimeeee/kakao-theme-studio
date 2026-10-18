import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { IconButton } from './IconButton'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  /** Prevent closing while an operation is running. */
  locked?: boolean
}

/** Centered modal: focus trap, Escape, outside click and scroll lock come from Radix. */
export function Dialog({ open, onOpenChange, title, description, children, footer, locked }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={(o) => (!locked || o) && onOpenChange(o)}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="animate-fade-in fixed inset-0 z-40 bg-black/30" />
        <RadixDialog.Content
          // Focus the dialog itself rather than its first button (닫기): a focused 닫기 shows its
          // tooltip, and the first Escape would only close that. Autofocused fields keep focus.
          tabIndex={-1}
          onOpenAutoFocus={(e) => {
            const content = e.currentTarget as HTMLElement
            e.preventDefault()
            if (!content.contains(document.activeElement)) content.focus()
          }}
          onEscapeKeyDown={(e) => locked && e.preventDefault()}
          onPointerDownOutside={(e) => locked && e.preventDefault()}
          className="animate-pop-in fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-[var(--radius-card)] bg-surface p-6 shadow-[var(--shadow-pop)] outline-none"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <RadixDialog.Title className="text-[18px] font-bold text-ink">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-[14px] text-sub">{description}</RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <IconButton label="닫기" icon={<X className="size-5" />} variant="ghost" disabled={locked} className="-mr-2 -mt-2" />
            </RadixDialog.Close>
          </div>
          {children}
          {footer && <div className="flex flex-wrap justify-end gap-2">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
