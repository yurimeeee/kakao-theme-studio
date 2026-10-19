import { Cloud, CopyPlus, Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { cloudProjectsHref, editorHref, navigate, projectsHref } from '@/app/router'
import { getRepositories } from '@/app/services'
import { useBlobUrl } from '@/assets/useAssetUrl'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { Segmented } from '@/components/ui/Segmented'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { toast } from '@/components/ui/toast'
import { formatModified } from '@/lib/format'
import { storageErrorMessage, type ProjectSummary } from '@/repositories/types'
import { openLogin } from '../auth/authDialog'
import { isVisibleLocally, useSession } from '../auth/session'
import { ThumbFrame } from '../cloud/CloudThumb'
import { normalizeThemeName, useEditor } from '../editor/store'
import { ExportDialog } from '../export/ExportDialog'
import { exportErrorMessage, exportProject } from '../export/exportProject'
import { CloudThemesList } from './CloudThemesList'
import { duplicateProject } from './duplicate'
import { ImportKthemeButton } from './ImportKthemeButton'

function Thumb({ blob }: { blob: Blob | null }) {
  return <ThumbFrame url={useBlobUrl(blob)} />
}

export function ProjectsPage({ tab }: { tab: 'local' | 'cloud' }) {
  const status = useSession((s) => s.status)
  const uid = useSession((s) => s.user?.uid ?? null)
  const signedIn = status === 'signed-in'
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.01em] lg:text-[32px]">내 작업</h1>
          <p className="mt-1 text-[14px] text-sub">
            {tab === 'cloud' ? '이 계정에 저장된 테마예요. 어느 기기에서든 이어서 꾸밀 수 있어요.' : '이 브라우저에 보관된 테마예요. 이어서 꾸며 보세요.'}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <ImportKthemeButton />
          <Button onClick={() => navigate('#/editor/new')} className="hidden sm:inline-flex">
            <Plus className="size-4" aria-hidden />새 테마
          </Button>
        </div>
      </div>
      {status !== 'unavailable' && (
        <Segmented
          label="보관 위치"
          hideLabel
          value={tab}
          options={[
            { value: 'local', label: '이 기기' },
            { value: 'cloud', label: '클라우드' },
          ]}
          onChange={(v) => navigate(v === 'cloud' ? cloudProjectsHref : projectsHref, true)}
          className="w-full max-w-[260px]"
        />
      )}
      {tab === 'local' || status === 'unavailable' ? (
        <LocalProjects />
      ) : signedIn ? (
        <CloudThemesList key={uid} />
      ) : status === 'loading' ? (
        <LoadingState>계정을 확인하고 있어요.</LoadingState>
      ) : (
        <EmptyState title="로그인하면 클라우드 테마를 볼 수 있어요." description="저장한 테마를 다른 기기에서도 이어서 꾸밀 수 있어요.">
          <Button onClick={() => openLogin()}>로그인</Button>
        </EmptyState>
      )}
    </div>
  )
}

function LocalProjects() {
  const status = useSession((s) => s.status)
  const uid = useSession((s) => s.user?.uid ?? null)
  const [all, setItems] = useState<ProjectSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<ProjectSummary | null>(null)
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [duplicating, setDuplicating] = useState<string | null>(null)

  // Copies linked to an account are listed only while that account is signed in.
  const items = status === 'loading' ? null : (all?.filter((p) => isVisibleLocally(p.cloudOwnerId)) ?? null)
  const hidden = all && items ? all.length - items.length : 0

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
  }, [load, uid])

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

  const duplicate = async (p: ProjectSummary) => {
    if (duplicating) return
    setDuplicating(p.id)
    try {
      await duplicateProject(p.id, p.thumbnail)
      toast('사본을 만들었어요. 원본은 그대로예요.')
      await load()
    } catch (e) {
      toast(storageErrorMessage(e))
    } finally {
      setDuplicating(null)
    }
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
    <>
      {items === null ? (
        <LoadingState>목록을 불러오고 있어요.</LoadingState>
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState title="아직 만든 테마가 없어요." description="색상이나 이미지로 나만의 테마를 만들어 보세요.">
          <Button onClick={() => navigate('#/editor/new')}>
            <Plus className="size-4" aria-hidden />새 테마 만들기
          </Button>
        </EmptyState>
      ) : (
        <ul className="mx-auto flex w-full max-w-[780px] flex-col gap-3" aria-label="테마 목록">
          {items.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-canvas p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5" data-testid="project-item">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <Thumb blob={p.thumbnail} />
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-semibold">{p.name}</p>
                  <p className="flex items-center gap-1.5 text-[13px] text-sub">
                    {p.cloudThemeId && <Cloud className="size-3.5 shrink-0" aria-label="클라우드에 연결됨" />}
                    이 기기에 보관 · {formatModified(p.updatedAt)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 justify-end gap-2">
                <IconButton label={`${p.name} 편집`} icon={<Pencil className="size-[18px]" />} variant="surface" onClick={() => navigate(editorHref(p.id))} />
                <IconButton
                  label={`${p.name} 사본 만들기`}
                  icon={<CopyPlus className="size-[18px]" />}
                  variant="surface"
                  busy={duplicating === p.id}
                  disabled={duplicating !== null}
                  onClick={() => void duplicate(p)}
                />
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

      {hidden > 0 && (
        <p className="text-center text-[13px] text-sub">
          {status === 'signed-in' ? '다른 계정' : '로그인한 계정'}에 연결된 테마 {hidden}개는 {status === 'signed-in' ? '그 계정으로 로그인하면' : '로그인하면'} 보여요.
        </p>
      )}

      {items && items.length > 0 && (
        <div className="flex justify-center">
          <IconButton label="새 테마" icon={<Plus className="size-6" />} variant="solid" size="lg" className="size-14" onClick={() => navigate('#/editor/new')} tooltipSide="top" />
        </div>
      )}

      <ExportDialog open={exporting !== null} onOpenChange={(o) => !o && setExporting(null)} initialName={exporting?.name ?? ''} onConfirm={confirmExport} />

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
    </>
  )
}
