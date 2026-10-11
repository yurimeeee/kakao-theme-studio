import type { ReactNode } from 'react'

export function FieldGroup({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-hair pt-5 first:border-t-0 first:pt-0">
      {(title || description) && (
        <header>
          {title && <h3 className="text-[14px] font-semibold text-ink">{title}</h3>}
          {description && <p className="mt-0.5 text-[13px] text-sub">{description}</p>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <p
      className={
        tone === 'warn'
          ? 'rounded-[var(--radius-field)] bg-canvas px-4 py-3 text-[13px] text-ink'
          : 'text-[13px] leading-relaxed text-sub'
      }
    >
      {children}
    </p>
  )
}
