import { useEffect, useId, useState } from 'react'
import { navigate } from '@/app/router'
import { getRepositories } from '@/app/services'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { toast } from '@/components/ui/toast'
import { cloudErrorMessage, toCloudError } from '@/cloud/errors'
import { flushAutosave } from '../editor/autosave'
import { useEditor } from '../editor/store'
import { loadAuth, loadCloud, useSession } from './session'

const PROVIDER_LABELS = { password: '이메일', google: 'Google', kakao: '카카오', other: '외부 계정' } as const

/**
 * Account summary, sign-out and 회원 탈퇴. Sign-out can remove this account's copies from this
 * browser; 탈퇴 deletes the account and its cloud data and keeps (or removes) the local copies.
 */
export function AccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const user = useSession((s) => s.user)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wipe, setWipe] = useState(false)
  const [linkedCount, setLinkedCount] = useState(0)
  const checkboxId = useId()
  const confirmId = useId()
  const [mode, setMode] = useState<'account' | 'delete'>('account')
  const [confirmed, setConfirmed] = useState(false)

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setMode('account')
      setConfirmed(false)
      setWipe(false)
      setError(null)
    }
    onOpenChange(next)
  }

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

  // Keep pending edits, then make sure no copy linked to this account stays open on screen.
  const closeLinkedEditor = async () => {
    await flushAutosave()
    const editor = useEditor.getState()
    if (editor.project?.cloudOwnerId === user.uid) {
      editor.close()
      navigate('#/editor/new', true)
    }
  }

  const deleteAccount = async () => {
    setBusy(true)
    setError(null)
    try {
      await closeLinkedEditor()
      const rt = await loadCloud()
      await rt.deleteAccount()
    } catch (e) {
      const kind = toCloudError(e).kind
      setError(kind === 'recent-login' || kind === 'network' ? cloudErrorMessage(e) : '탈퇴하지 못했어요. 다시 시도해 주세요.')
      setBusy(false)
      return
    }
    // The account is gone. Local cleanup failing must not keep the deleted session around.
    const projects = getRepositories().projects
    await (wipe ? projects.deleteByCloudOwner(user.uid) : projects.unlinkCloudOwner(user.uid)).catch(() => undefined)
    await loadAuth()
      .then((rt) => rt.authApi.signOut(rt.auth))
      .catch(() => undefined)
    setBusy(false)
    handleOpenChange(false)
    toast('탈퇴했어요. 그동안 이용해 주셔서 고마워요.')
  }

  const signOut = async () => {
    setBusy(true)
    setError(null)
    try {
      await closeLinkedEditor()
      if (wipe) await getRepositories().projects.deleteByCloudOwner(user.uid)
      const rt = await loadAuth()
      await rt.authApi.signOut(rt.auth)
      handleOpenChange(false)
      toast('로그아웃했어요.')
    } catch {
      setError('로그아웃하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'delete') {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange} title="회원 탈퇴" locked={busy}>
        <ul className="list-disc space-y-1 pl-5 text-[14px] leading-relaxed">
          <li>클라우드에 저장한 테마와 이미지가 모두 지워져요.</li>
          <li>공개·링크 공개한 테마는 바로 볼 수 없게 되고, 갤러리에서도 빠져요.</li>
          <li>지운 계정과 데이터는 되살릴 수 없어요. 이미 다른 사람이 내려받은 파일은 회수되지 않아요.</li>
        </ul>
        <p className="text-[13px] leading-relaxed text-sub">
          {linkedCount > 0
            ? `이 기기에 있는 사본 ${linkedCount}개는 로그인 없이 쓰는 내 작업으로 남겨요.`
            : '이 기기의 내 작업(로그인 없이 만든 테마)은 그대로 남아요.'}
        </p>
        {linkedCount > 0 && (
          <label htmlFor={checkboxId} className="flex min-h-11 cursor-pointer items-start gap-3 text-[14px]">
            <input id={checkboxId} type="checkbox" checked={wipe} onChange={(e) => setWipe(e.target.checked)} className="mt-1 size-4 accent-[var(--color-ink)]" disabled={busy} />
            <span>이 기기 사본 {linkedCount}개도 지우기</span>
          </label>
        )}
        <label htmlFor={confirmId} className="flex min-h-11 cursor-pointer items-start gap-3 text-[14px] font-semibold">
          <input id={confirmId} type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 size-4 accent-[var(--color-ink)]" disabled={busy} />
          <span>안내를 확인했고 탈퇴할게요</span>
        </label>
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="soft" onClick={() => setMode('account')} disabled={busy}>
            취소
          </Button>
          <Button variant="danger" onClick={() => void deleteAccount()} busy={busy} disabled={!confirmed}>
            탈퇴하기
          </Button>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} title="내 계정" locked={busy}>
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
        <Button variant="soft" onClick={() => handleOpenChange(false)} disabled={busy}>
          닫기
        </Button>
        <Button onClick={() => void signOut()} busy={busy}>
          로그아웃
        </Button>
      </div>
      <button
        type="button"
        onClick={() => {
          setError(null)
          setWipe(false)
          setMode('delete')
        }}
        disabled={busy}
        className="-my-2 self-start py-2 text-[13px] text-sub underline underline-offset-2 hover:text-ink disabled:opacity-50"
      >
        회원 탈퇴
      </button>
    </Dialog>
  )
}
