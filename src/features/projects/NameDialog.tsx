import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { THEME_NAME_MAX_LENGTH } from '@/domain/theme/defaults'

interface NameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  initialName: string
  confirmLabel: string
  busyLabel: string
  /** Resolve on success; throw an Error whose message is shown (Korean). */
  onConfirm: (name: string) => Promise<void>
  children?: ReactNode
}

/** Name input used by 저장 and 내보내기 confirmation. Blocks double submit while running. */
export function NameDialog(props: NameDialogProps) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange} title={props.title} description={props.description} locked={busy}>
      {/* Remounted per opening so the field starts from the current name. */}
      {props.open && <NameForm {...props} busy={busy} setBusy={setBusy} />}
    </Dialog>
  )
}

function NameForm({ onOpenChange, initialName, confirmLabel, busyLabel, onConfirm, children, busy, setBusy }: NameDialogProps & { busy: boolean; setBusy: (b: boolean) => void }) {
  const id = useId()
  const [name, setName] = useState(initialName)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const trimmed = name.trim()
    if (!trimmed) {
      setError('테마 이름을 입력해 주세요.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onConfirm(trimmed)
      setBusy(false)
      onOpenChange(false)
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : '저장하지 못했어요. 다시 시도해 주세요.')
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="text-[13px] text-sub">
          테마 이름
        </label>
        <input
          id={id}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (error) setError(null)
          }}
          maxLength={THEME_NAME_MAX_LENGTH}
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className="min-h-12 rounded-[var(--radius-field)] bg-canvas px-4 text-[15px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
          onFocus={(e) => e.currentTarget.select()}
          disabled={busy}
        />
        <div className="flex justify-between text-[12px]">
          <span id={`${id}-err`} role={error ? 'alert' : undefined} className="text-danger">
            {error}
          </span>
          <span className="tabular-nums text-faint">
            {name.length}/{THEME_NAME_MAX_LENGTH}
          </span>
        </div>
      </div>
      {children}
      <div className="flex justify-end gap-2">
        <Button variant="soft" onClick={() => onOpenChange(false)} disabled={busy}>
          취소
        </Button>
        <Button type="submit" busy={busy}>
          {busy ? busyLabel : confirmLabel}
        </Button>
      </div>
    </form>
  )
}
