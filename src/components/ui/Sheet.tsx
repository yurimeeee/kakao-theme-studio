import * as RadixDialog from '@radix-ui/react-dialog'
import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { Button } from './Button'
import { cn } from './cn'

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  /**
   * Shown above the sheet while it is open (e.g. a live preview), on screens tall enough to
   * fit both. The sheet then takes a fixed share of the height and the page is not dimmed.
   */
  peek?: ReactNode
}

const CLOSE_DISTANCE = 96

/**
 * Mobile bottom sheet. Dragging the handle down past CLOSE_DISTANCE dismisses it;
 * Escape, the backdrop and 완료 also close. Closing never triggers a server write —
 * edits are already applied live and kept by local autosave.
 */
export function Sheet({ open, onOpenChange, title, description, children, peek }: SheetProps) {
  const roomForPeek = useMediaQuery('(min-height: 600px)')
  const split = Boolean(peek) && roomForPeek
  const [drag, setDrag] = useState(0)
  const start = useRef<number | null>(null)
  const distance = useRef(0)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    start.current = e.clientY
    distance.current = 0
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return
    distance.current = Math.max(0, e.clientY - start.current)
    setDrag(distance.current)
  }
  const onPointerEnd = () => {
    if (start.current === null) return
    start.current = null
    setDrag(0)
    if (distance.current > CLOSE_DISTANCE) onOpenChange(false)
  }

  const panel = (
    <div
      className={cn(
        'animate-sheet-in mx-auto flex w-full max-w-[640px] flex-col rounded-t-[var(--radius-card)] bg-surface shadow-[var(--shadow-sheet)]',
        split ? 'h-[54dvh] shrink-0' : 'max-h-[min(64dvh,640px)]',
      )}
      style={{ transform: drag ? `translateY(${drag}px)` : undefined, transition: drag ? 'none' : 'transform 180ms ease-out' }}
    >
      <div
        className="flex h-7 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        data-testid="sheet-handle"
        aria-hidden
      >
        <span className="h-1 w-10 rounded-full bg-hair" />
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3">
        <div className="min-w-0">
          <p className="text-[12px] text-sub">속성 편집</p>
          <RadixDialog.Title className="truncate text-[20px] font-bold text-ink">{title}</RadixDialog.Title>
          {/* Split mode gives the room to the preview instead. */}
          {description && !split && <p className="text-[13px] text-sub">{description}</p>}
        </div>
        <RadixDialog.Close asChild>
          <Button variant="soft" className="min-h-10 px-4">
            완료
          </Button>
        </RadixDialog.Close>
      </div>
      <div className="pb-safe min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1">{children}</div>
    </div>
  )

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        {split ? (
          <RadixDialog.Content aria-describedby={undefined} className="fixed inset-0 z-50 flex flex-col">
            <div className="animate-fade-in min-h-0 flex-1 bg-canvas" data-testid="sheet-peek">
              {peek}
            </div>
            {panel}
          </RadixDialog.Content>
        ) : (
          <>
            <RadixDialog.Overlay className="animate-fade-in fixed inset-0 z-40 bg-black/10" />
            <RadixDialog.Content aria-describedby={undefined} className="fixed inset-x-0 bottom-0 z-50">
              {panel}
            </RadixDialog.Content>
          </>
        )}
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
