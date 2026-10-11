import { Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { editorHref, navigate } from '@/app/router'
import { getRepositories } from '@/app/services'
import { useBlobUrl } from '@/assets/useAssetUrl'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { Spinner } from '@/components/ui/Spinner'
import { toast } from '@/components/ui/toast'
import { formatModified } from '@/lib/format'
import { storageErrorMessage, type ProjectSummary } from '@/repositories/types'
import { normalizeThemeName, useEditor } from '../editor/store'
import { exportErrorMessage, exportProject } from '../export/exportProject'
import { NameDialog } from './NameDialog'

function Thumb({ blob }: { blob: Blob | null }) {
  const url = useBlobUrl(blob)
  return (
    <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-surface" aria-hidden>
      {url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <span className="flex flex-col gap-1.5">
          <span className="h-2.5 w-7 rounded-full bg-hair" />
          <span className="ml-3 h-2.5 w-7 rounded-full bg-faint/50" />
        </span>
      )}
    </span>
  )
}

export function ProjectsPage() {
  const [items, setItems] = useState<ProjectSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<ProjectSummary | null>(null)
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await getRepositories().projects.list()
      setError(null)
      setItems(list)
    } catch (e) {
      setError(storageErrorMessage(e))
      setItems([])
    }
  }, [])

  useEffect(() => {
    // Initial read from IndexedDB (external system); state is set after the await.
    // eslint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  const confirmExport = async (name: string) => {
    const { projects, assets } = getRepositories()
    const target = exporting!
    try {
      let project = await projects.get(target.id)
      if (!project) throw new Error('missing')
      const clean = normalizeThemeName(name)
      if (clean && clean !== project.name) project = await projects.save({ ...project, name: clean }, { snapshotAt: Date.now() })
      await exportProject(project, null, assets)
    } catch (e) {
      throw new Error(e instanceof Error && e.message === 'missing' ? '이 테마를 볼 수 없어요.' : exportErrorMessage(e))
    }
    toast('테마 파일을 내려받았어요.')
    void load()
  }

  const confirmDelete = async () => {
    if (!deleting || deleteBusy) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await getRepositories().projects.delete(deleting.id)
      if (useEditor.getState().project?.id === deleting.id) useEditor.getState().close()
      setDeleting(null)
      toast('테마를 삭제했어요.')
      await load()
    } catch (e) {
      setDeleteError(storageErrorMessage(e))
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.01em] lg:text-[32px]">내 작업</h1>
          <p className="mt-1 text-[14px] text-sub">이 브라우저에 보관된 테마예요. 이어서 꾸며 보세요.</p>
        </div>
        <Button onClick={() => navigate('#/editor/new')} className="hidden shrink-0 sm:inline-flex">
          <Plus className="size-4" aria-hidden />새 테마
        </Button>
      </div>

      {items === null ? (
        <div className="flex min-h-40 items-center justify-center gap-3 text-sub" role="status">
          <Spinner className="size-5" />
          목록을 불러오고 있어요.
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] bg-canvas px-6 py-12 text-center" role="alert">
          <p className="font-semibold">{error}</p>
          <Button variant="surface" onClick={() => void load()}>
            다시 시도
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] bg-canvas px-6 py-14 text-center">
          <p className="text-[17px] font-bold">아직 만든 테마가 없어요.</p>
          <p className="text-[14px] text-sub">색상이나 이미지로 나만의 테마를 만들어 보세요.</p>
          <Button className="mt-4" onClick={() => navigate('#/editor/new')}>
            <Plus className="size-4" aria-hidden />새 테마 만들기
          </Button>
        </div>
      ) : (
        <ul className="mx-auto flex w-full max-w-[780px] flex-col gap-3" aria-label="테마 목록">
          {items.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-canvas p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5" data-testid="project-item">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <Thumb blob={p.thumbnail} />
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-semibold">{p.name}</p>
                  <p className="text-[13px] text-sub">이 기기에 보관 · {formatModified(p.updatedAt)}</p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2 pl-20 sm:pl-0">
                <IconButton label={`${p.name} 편집`} icon={<Pencil className="size-[18px]" />} variant="surface" onClick={() => navigate(editorHref(p.id))} />
                <IconButton label={`${p.name} 내보내기`} icon={<Download className="size-[18px]" />} variant="surface" onClick={() => setExporting(p)} />
                <IconButton
                  label={`${p.name} 삭제`}
                  icon={<Trash2 className="size-[18px]" />}
                  variant="surface"
                  onClick={() => {
                    setDeleteError(null)
                    setDeleting(p)
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {items && items.length > 0 && (
        <div className="flex justify-center">
          <IconButton label="새 테마" icon={<Plus className="size-6" />} variant="solid" size="lg" className="size-14" onClick={() => navigate('#/editor/new')} tooltipSide="top" />
        </div>
      )}

      <NameDialog
        open={exporting !== null}
        onOpenChange={(o) => !o && setExporting(null)}
        title="테마 내보내기"
        description="아이폰 카카오톡용 .ktheme 파일을 이 브라우저에서 만들어 내려받아요."
        initialName={exporting?.name ?? ''}
        confirmLabel="내보내기"
        busyLabel="테마를 준비하고 있어요."
        onConfirm={confirmExport}
      >
        <p className="rounded-[var(--radius-field)] bg-canvas px-4 py-3 text-[13px] leading-relaxed text-sub">
          카카오톡 앱에서의 실제 적용은 아직 기기 검증 중이에요. 파일은 서버에 올리지 않아요.
        </p>
      </NameDialog>

      <Dialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="테마를 삭제할까요?"
        description="삭제한 작업은 되돌릴 수 없어요."
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
        {deleteError && (
          <p role="alert" className="text-[13px] text-danger">
            {deleteError}
          </p>
        )}
      </Dialog>
    </div>
  )
}
