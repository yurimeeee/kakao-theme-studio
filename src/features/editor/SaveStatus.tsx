import { AlertCircle } from 'lucide-react'
import { formatSavedTime } from '@/lib/format'
import { flushAutosave } from './autosave'
import type { SaveState } from './store'

export function SaveStatus({ state }: { state: SaveState }) {
  const text = (() => {
    switch (state.kind) {
      case 'idle':
        return '아직 이 기기에 보관하지 않았어요'
      case 'pending':
        return '변경사항을 보관하고 있어요'
      case 'saving':
        return '저장 중…'
      case 'saved':
        return `이 기기에 보관됨 · ${formatSavedTime(state.at)}`
      case 'error':
        return state.message
    }
  })()
  return (
    <div className="flex min-h-6 flex-wrap items-center gap-2 text-[13px]" aria-live="polite" data-testid="save-status" data-state={state.kind}>
      {state.kind === 'error' && <AlertCircle className="size-4 text-danger" aria-hidden />}
      <span className={state.kind === 'error' ? 'text-danger' : 'text-sub'}>{text}</span>
      {state.kind === 'error' && (
        <button type="button" onClick={() => void flushAutosave()} className="min-h-8 rounded-full bg-canvas px-3 text-[12px] font-medium text-ink">
          다시 시도
        </button>
      )}
    </div>
  )
}
