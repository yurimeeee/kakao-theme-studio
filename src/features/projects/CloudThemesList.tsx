import { Download, Pencil, Share2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { editorHref, navigate } from '@/app/router'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { toast } from '@/components/ui/toast'
import { cloudErrorMessage } from '@/cloud/errors'
import { VISIBILITY_LABELS } from '@/cloud/model'
import { formatModified } from '@/lib/format'
import type { CloudThemeSummary } from '@/repositories/cloud/cloudThemes'
import { loadCloud, useSession } from '../auth/session'
import { CloudThumb } from '../cloud/CloudThumb'
import { exportCloudTheme, openCloudTheme } from '../cloud/cloudSync'
import { exportErrorMessage } from '../export/exportProject'
import { ShareDialog } from '../sharing/ShareDialog'

const loadThumb = (path: string) => loadCloud().then((rt) => rt.themes.downloadBlob(path))

/** 내 테마: the signed-in account's cloud themes. Keyed by uid by the parent, so an account switch starts empty. */
export function CloudThemesList() {
  const uid = useSession((s) => s.user?.uid ?? null)
  const [items, setItems] = useState<CloudThemeSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [sharing, setSharing] = useState<CloudThemeSummary | null>(null)
  const [deleting, setDeleting] = useState<CloudThemeSummary | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [diverged, setDiverged] = useState<{ theme: CloudThemeSummary; localId: string } | null>(null)
  const [divergedBusy, setDivergedBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const rt = await loadCloud()
      setItems(await rt.themes.list())
    } catch (e) {
      setError(cloudErrorMessage(e))
      setItems([])
    }
  }, [])

  useEffect(() => {
    if (!uid) return
    // eslint-disable-next-line react/set-state-in-effect -- network read, then state
    void load()
  }, [uid, load])

  const edit = async (t: CloudThemeSummary, replace = false) => {
    if (busyId) return
    setBusyId(t.id)
    try {
      const r = await openCloudTheme(t.id, { replace })
      if (r.kind === 'diverged') setDiverged({ theme: t, localId: r.localId })
      else navigate(editorHref(r.localId))
    } catch (e) {
      toast(cloudErrorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  const exportTheme = async (t: CloudThemeSummary) => {
    if (busyId) return
    setBusyId(t.id)
    try {
      await exportCloudTheme(t.id)
      toast('테마 파일을 내려받았어요.')
    } catch (e) {
      toast(e && typeof e === 'object' && 'kind' in e ? cloudErrorMessage(e) : exportErrorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleting || deleteBusy) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      const rt = await loadCloud()
      await rt.themes.delete(deleting.id)
      setItems((prev) => prev?.filter((p) => p.id !== deleting.id) ?? null)
      setDeleting(null)
      toast('클라우드에서 테마를 삭제했어요.')
    } catch (e) {
      setDeleteError(cloudErrorMessage(e))
    } finally {
      setDeleteBusy(false)
    }
  }

  const resolveDiverged = async (choice: 'cloud' | 'local') => {
    if (!diverged) return
    if (choice === 'local') {
      navigate(editorHref(diverged.localId))
      setDiverged(null)
      return
    }
    setDivergedBusy(true)
    try {
      const r = await openCloudTheme(diverged.theme.id, { replace: true })
      setDiverged(null)
      navigate(editorHref(r.localId))
    } catch (e) {
      toast(cloudErrorMessage(e))
    } finally {
      setDivergedBusy(false)
    }
  }

  if (items === null) {
    return (
      <LoadingState>클라우드 테마를 불러오고 있어요.</LoadingState>
    )
  }
  if (error) {
    return (
      <ErrorState message={error} onRetry={() => void load()} />
    )
  }
  if (items.length === 0) {
    return (
      <EmptyState title="클라우드에 저장한 테마가 없어요." description="에디터에서 저장하면 이 계정에 보관돼요." />
    )
  }

  return (
    <>
      <ul className="mx-auto flex w-full max-w-[780px] flex-col gap-3" aria-label="클라우드 테마 목록">
        {items.map((t) => (
          <li key={t.id} className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-canvas p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5" data-testid="cloud-item">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <CloudThumb path={t.thumbnailPath} load={loadThumb} />
              <div className="min-w-0">
                <p className="truncate text-[16px] font-semibold">{t.name}</p>
                <p className="text-[13px] text-sub">
                  <span data-testid="cloud-visibility">{VISIBILITY_LABELS[t.visibility]}</span> · {formatModified(t.updatedAt)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2 pl-20 sm:pl-0">
              <IconButton label={`${t.name} 편집`} icon={<Pencil className="size-[18px]" />} variant="surface" busy={busyId === t.id} disabled={busyId !== null} onClick={() => void edit(t)} />
              <IconButton label={`${t.name} 내보내기`} icon={<Download className="size-[18px]" />} variant="surface" disabled={busyId !== null} onClick={() => void exportTheme(t)} />
              <IconButton label={`${t.name} 공유`} icon={<Share2 className="size-[18px]" />} variant="surface" disabled={busyId !== null} onClick={() => setSharing(t)} />
              <IconButton
                label={`${t.name} 삭제`}
                icon={<Trash2 className="size-[18px]" />}
                variant="surface"
                disabled={busyId !== null}
                onClick={() => {
                  setDeleteError(null)
                  setDeleting(t)
                }}
              />
            </div>
          </li>
        ))}
      </ul>

      <ShareDialog
        themeId={sharing?.id ?? null}
        themeName={sharing?.name ?? ''}
        onOpenChange={(o) => !o && setSharing(null)}
        onChanged={(visibility, shareId) => setItems((prev) => prev?.map((p) => (p.id === sharing?.id ? { ...p, visibility, shareId } : p)) ?? null)}
      />

      <Dialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="클라우드에서 테마를 삭제할까요?"
        description="공유 링크도 함께 닫혀요. 삭제한 테마는 되돌릴 수 없어요."
        locked={deleteBusy}
        footer={
          <>
            <Button variant="soft" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              취소
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()} busy={deleteBusy}>
              삭제
            </Button>
          </>
        }
      >
        {deleting && <p className="truncate rounded-[var(--radius-field)] bg-canvas px-4 py-3 text-[14px] font-semibold">{deleting.name}</p>}
        <p className="text-[13px] text-sub">이 기기에 있는 사본은 남아 있어요.</p>
        {deleteError && (
          <p role="alert" className="text-[13px] text-danger">
            {deleteError}
          </p>
        )}
      </Dialog>

      <Dialog
        open={diverged !== null}
        onOpenChange={(o) => !o && setDiverged(null)}
        title="이 기기의 사본과 클라우드 버전이 달라요"
        description="다른 기기에서 저장했거나, 이 기기에서 저장하지 않은 변경이 있어요."
        locked={divergedBusy}
        footer={
          <>
            <Button variant="soft" onClick={() => void resolveDiverged('local')} disabled={divergedBusy}>
              이 기기 사본 열기
            </Button>
            <Button onClick={() => void resolveDiverged('cloud')} busy={divergedBusy}>
              클라우드 버전 불러오기
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-sub">클라우드 버전을 불러오면 이 기기 사본의 저장하지 않은 변경은 사라져요.</p>
      </Dialog>
    </>
  )
}
