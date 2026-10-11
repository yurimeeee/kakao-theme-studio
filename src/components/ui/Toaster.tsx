import { useToasts } from './toast'

export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className="animate-fade-in pointer-events-auto max-w-[420px] rounded-full bg-ink px-5 py-3 text-center text-[14px] font-medium text-white shadow-[var(--shadow-pop)]"
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
