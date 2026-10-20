import { useState } from 'react'
import { editorHref, navigate } from '@/app/router'
import { cn } from '@/components/ui/cn'
import { Dialog } from '@/components/ui/Dialog'
import { toastError } from '@/components/ui/toast'
import { presetConfig, THEME_PRESETS, type ThemePreset } from '@/domain/theme/presets'
import { resolveTheme } from '@/domain/theme/resolve'
import { storageErrorMessage } from '@/repositories/types'
import { createProjectFromPreset } from './newTheme'

/** What a chat looks like in the preset: chat room background with one bubble each way. */
export function PresetSample({ preset, compact }: { preset: ThemePreset; compact?: boolean }) {
  const theme = resolveTheme(presetConfig(preset))
  const { send, receive } = theme.bubbles
  const radius = (b: typeof send) => (b.shape === 'square' ? 2 : b.shape === 'capsule' ? 999 : Math.max(4, b.radius * 0.7))
  return (
    <div className={cn('flex w-full flex-col justify-center rounded-[10px] border border-black/5', compact ? 'h-[52px] gap-1 px-2' : 'h-[72px] gap-1.5 px-2.5')} style={{ background: theme.chatroom.background.color }} aria-hidden>
      <span className={cn('w-3/5 self-start', compact ? 'h-3' : 'h-4')} style={{ background: receive.color, borderRadius: radius(receive) }} />
      <span className={cn('w-2/5 self-end', compact ? 'h-3' : 'h-4')} style={{ background: send.color, borderRadius: radius(send) }} />
      <span className="h-1.5 w-1/4 self-start rounded-full" style={{ background: theme.palette.subText }} />
    </div>
  )
}

/** 새 테마: pick a starting template, then the editor opens on the new project. */
export function NewThemeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [busy, setBusy] = useState<string | null>(null)

  const start = async (preset: ThemePreset) => {
    if (busy) return
    setBusy(preset.id)
    try {
      const id = await createProjectFromPreset(preset)
      onOpenChange(false)
      navigate(editorHref(id))
    } catch (e) {
      toastError(storageErrorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="새 테마 만들기" description="시작할 색 조합을 골라 주세요. 만든 뒤에도 모든 색을 바꿀 수 있어요." locked={busy !== null}>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="시작 템플릿">
        {THEME_PRESETS.map((preset) => (
          <li key={preset.id}>
            <button
              type="button"
              className="flex w-full flex-col gap-1.5 rounded-[var(--radius-field)] p-1.5 text-left transition-colors hover:bg-canvas focus-visible:bg-canvas disabled:opacity-50"
              disabled={busy !== null}
              aria-busy={busy === preset.id}
              onClick={() => void start(preset)}
            >
              <PresetSample preset={preset} />
              <span className="px-0.5 text-[13px] font-medium">{preset.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
