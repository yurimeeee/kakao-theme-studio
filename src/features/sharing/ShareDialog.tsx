import { Copy, RefreshCw, Share2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Segmented } from '@/components/ui/Segmented'
import { Spinner } from '@/components/ui/Spinner'
import { toast } from '@/components/ui/toast'
import { copyText } from '@/lib/clipboard'
import { cloudErrorMessage } from '@/cloud/errors'
import { VISIBILITIES, VISIBILITY_DESCRIPTIONS, VISIBILITY_LABELS, type Visibility } from '@/cloud/model'
import { loadCloud } from '../auth/session'
import { shareUrl } from '../cloud/cloudSync'

interface ShareDialogProps {
  /** Cloud theme to configure; null closes the dialog. */
  themeId: string | null
  themeName: string
  onOpenChange: (open: boolean) => void
  onChanged?: (visibility: Visibility, shareId: string | null) => void
}

/** 공개 범위 (confirmed with 확인, never on toggle) and the share link. Owner only. */
export function ShareDialog({ themeId, themeName, onOpenChange, onChanged }: ShareDialogProps) {
  return (
    <Dialog open={themeId !== null} onOpenChange={onOpenChange} title="테마 공유" description={themeName}>
      {themeId && <ShareForm key={themeId} themeId={themeId} onChanged={onChanged} />}
    </Dialog>
  )
}

function ShareForm({ themeId, onChanged }: { themeId: string; onChanged?: ShareDialogProps['onChanged'] }) {
  const [current, setCurrent] = useState<{ visibility: Visibility; shareId: string | null; allowRemix: boolean } | null>(null)
  const [draft, setDraft] = useState<Visibility>('private')
  const [busy, setBusy] = useState<null | 'apply' | 'rotate' | 'remix'>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const linkRef = useRef<HTMLInputElement>(null)
  const linkId = useId()
  const remixId = useId()

  const load = async () => {
    setLoadFailed(false)
    try {
      const rt = await loadCloud()
      const theme = await rt.themes.get(themeId)
      if (!theme) throw new Error('missing')
      setCurrent({ visibility: theme.visibility, shareId: theme.shareId, allowRemix: theme.allowRemix })
      setDraft(theme.visibility)
    } catch {
      setLoadFailed(true)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- reads Firestore, then sets state
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeId])

  const apply = async (visibility: Visibility, rotateLink = false) => {
    if (busy) return
    setBusy(rotateLink ? 'rotate' : 'apply')
    setError(null)
    try {
      const rt = await loadCloud()
      const { shareId } = await rt.shares.setVisibility(themeId, visibility, { rotateLink })
      setCurrent((c) => ({ visibility, shareId, allowRemix: c?.allowRemix ?? false }))
      setConfirmRotate(false)
      onChanged?.(visibility, shareId)
      toast(rotateLink ? '새 링크를 만들었어요. 이전 링크는 더 이상 열리지 않아요.' : `${VISIBILITY_LABELS[visibility]}로 바꿨어요.`)
    } catch (e) {
      setError(cloudErrorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const toggleRemix = async (allowRemix: boolean) => {
    if (busy) return
    setBusy('remix')
    setError(null)
    // Show the choice at once; roll back if it could not be stored.
    setCurrent((c) => (c ? { ...c, allowRemix } : c))
    try {
      const rt = await loadCloud()
      await rt.shares.setAllowRemix(themeId, allowRemix)
      toast(allowRemix ? '복제를 허용했어요.' : '복제를 허용하지 않아요.')
    } catch (e) {
      setCurrent((c) => (c ? { ...c, allowRemix: !allowRemix } : c))
      setError(cloudErrorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  if (loadFailed) {
    return (
      <div className="flex flex-col items-start gap-3" role="alert">
        <p className="text-[14px]">공유 설정을 불러오지 못했어요.</p>
        <Button variant="soft" onClick={() => void load()}>
          다시 시도
        </Button>
      </div>
    )
  }
  if (!current) {
    return (
      <p role="status" className="flex items-center gap-2 text-[14px] text-sub">
        <Spinner />
        공유 설정을 불러오고 있어요.
      </p>
    )
  }

  const url = current.shareId ? shareUrl(current.shareId) : null
  const dirty = draft !== current.visibility

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Segmented
          label="공개 범위"
          value={draft}
          options={VISIBILITIES.map((v) => ({ value: v, label: VISIBILITY_LABELS[v] }))}
          onChange={(v) => {
            setDraft(v)
            setError(null)
          }}
        />
        <p className="text-[13px] leading-relaxed text-sub" aria-live="polite">
          {VISIBILITY_DESCRIPTIONS[draft]}
        </p>
        {dirty && (
          <Button onClick={() => void apply(draft)} busy={busy === 'apply'} disabled={busy !== null} className="self-end">
            {busy === 'apply' ? '적용하고 있어요…' : `${VISIBILITY_LABELS[draft]}로 바꾸기`}
          </Button>
        )}
      </div>

      {url && !dirty && (
        <div className="flex flex-col gap-2">
          <label htmlFor={linkId} className="text-[13px] text-sub">
            공유 링크
          </label>
          <input
            id={linkId}
            ref={linkRef}
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="min-h-12 truncate rounded-[var(--radius-field)] bg-canvas px-4 text-[14px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void copyText(url, linkRef.current).then((ok) => toast(ok ? '링크를 복사했어요.' : '링크를 복사하지 못했어요. 직접 선택해 복사해 주세요.'))}
              disabled={busy !== null}
            >
              <Copy className="size-4" aria-hidden />
              링크 복사
            </Button>
            {typeof navigator.share === 'function' && (
              <Button variant="soft" onClick={() => void navigator.share({ url }).catch(() => undefined)} disabled={busy !== null}>
                <Share2 className="size-4" aria-hidden />
                공유
              </Button>
            )}
            <Button variant="soft" onClick={() => setConfirmRotate(true)} disabled={busy !== null}>
              <RefreshCw className="size-4" aria-hidden />
              링크 변경
            </Button>
          </div>
          {confirmRotate && (
            <div className="flex flex-col gap-3 rounded-[var(--radius-field)] bg-canvas px-4 py-3" role="group" aria-label="링크 변경 확인">
              <p className="text-[13px] leading-relaxed">새 링크를 만들면 지금 링크로는 더 이상 열 수 없어요.</p>
              <div className="flex justify-end gap-2">
                <Button variant="surface" onClick={() => setConfirmRotate(false)} disabled={busy !== null}>
                  취소
                </Button>
                <Button onClick={() => void apply(current.visibility, true)} busy={busy === 'rotate'}>
                  새 링크 만들기
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <label htmlFor={remixId} className="flex min-h-11 cursor-pointer items-start gap-3 text-[14px]">
        <input
          id={remixId}
          type="checkbox"
          checked={current.allowRemix}
          onChange={(e) => void toggleRemix(e.target.checked)}
          disabled={busy !== null}
          className="mt-1 size-4 accent-[var(--color-ink)]"
        />
        <span>
          내 작업으로 복제 허용
          <span className="block text-[12px] leading-relaxed text-sub">
            {current.visibility === 'private'
              ? '공개하거나 링크 공개하면 적용돼요. '
              : ''}
            허용하면 보는 사람이 이 테마를 자기 작업으로 가져와 고칠 수 있어요. 원본 이름과 제작자는 복제본에 함께 남아요.
          </span>
        </span>
      </label>

      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
      <p className="text-[12px] leading-relaxed text-faint">
        공개된 테마는 로그인 없이 조회·다운로드할 수 있어요. 이미 내려받은 파일은 공개를 끝내도 회수되지 않아요.
      </p>
    </div>
  )
}
