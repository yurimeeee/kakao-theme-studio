import { useEffect, useId, useState } from 'react'
import { navigate } from '@/app/router'
import { getRepositories } from '@/app/services'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { toast } from '@/components/ui/toast'
import { flushAutosave } from '../editor/autosave'
import { useEditor } from '../editor/store'
import { loadAuth, useSession } from './session'

const PROVIDER_LABELS = { password: '이메일', google: 'Google', kakao: '카카오', other: '외부 계정' } as const

/** Account summary and sign-out. Optionally removes this account's cloud copies from this browser. */
export function AccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const user = useSession((s) => s.user)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wipe, setWipe] = useState(false)
  const [linkedCount, setLinkedCount] = useState(0)
  const checkboxId = useId()

  useEffect(() => {
    if (!open || !user) return
    let cancelled = false
    void getRepositories()
      .projects.list()
      .then((list) => !cancelled && setLinkedCount(list.filter((p) => p.cloudOwnerId === user.uid).length))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [open, user])

  if (!user) return null

  const signOut = async () => {
    setBusy(true)
    setError(null)
    try {
      // Keep pending edits, then make sure no private copy stays open on screen.
      await flushAutosave()
      const editor = useEditor.getState()
      if (editor.project?.cloudOwnerId === user.uid) {
        editor.close()
        navigate('#/editor/new', true)
      }
      if (wipe) await getRepositories().projects.deleteByCloudOwner(user.uid)
      const rt = await loadAuth()
      await rt.authApi.signOut(rt.auth)
      onOpenChange(false)
      toast('로그아웃했어요.')
    } catch {
      setError('로그아웃하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="내 계정" locked={busy}>
      <div className="rounded-[var(--radius-field)] bg-canvas px-4 py-3">
        <p className="truncate text-[15px] font-semibold">{user.displayName || '이름 없음'}</p>
        <p className="truncate text-[13px] text-sub">
          {PROVIDER_LABELS[user.provider]} 로그인{user.email ? ` · ${user.email}` : ''}
        </p>
      </div>
      <p className="text-[13px] leading-relaxed text-sub">
        로그아웃하면 이 계정에 연결된 테마는 이 기기의 내 작업에서 숨겨져요. 다시 로그인하면 보여요.
      </p>
      {linkedCount > 0 && (
        <label htmlFor={checkboxId} className="flex min-h-11 cursor-pointer items-start gap-3 text-[14px]">
          <input id={checkboxId} type="checkbox" checked={wipe} onChange={(e) => setWipe(e.target.checked)} className="mt-1 size-4 accent-[var(--color-ink)]" disabled={busy} />
          <span>
            이 기기에 남은 사본 {linkedCount}개도 지우기
            <span className="block text-[12px] text-sub">함께 쓰는 기기라면 지워 주세요. 클라우드에 저장하지 않은 변경은 사라져요.</span>
          </span>
        </label>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="soft" onClick={() => onOpenChange(false)} disabled={busy}>
          닫기
        </Button>
        <Button onClick={() => void signOut()} busy={busy}>
          로그아웃
        </Button>
      </div>
    </Dialog>
  )
}
