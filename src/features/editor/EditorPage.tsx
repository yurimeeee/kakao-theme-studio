import { AlertCircle, Download, Save, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { projectsHref, type Route } from '@/app/router'
import { getRepositories } from '@/app/services'
import { cn } from '@/components/ui/cn'
import { IconButton } from '@/components/ui/IconButton'
import { Segmented } from '@/components/ui/Segmented'
import { Sheet } from '@/components/ui/Sheet'
import { Spinner } from '@/components/ui/Spinner'
import { toast } from '@/components/ui/toast'
import type { ElementKey, PreviewScreen } from '@/domain/theme/types'
import { formatSavedTime } from '@/lib/format'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { exportErrorMessage, exportProject } from '../export/exportProject'
import { ThemePreview } from '../preview/ThemePreview'
import { NameDialog } from '../projects/NameDialog'
import { flushAutosave } from './autosave'
import { ELEMENT_ORDER, ELEMENTS, SCREEN_LABELS } from './elements'
import { ElementPanel } from './panels/panels'
import { useEditor, type SaveState } from './store'

const SCREENS = (Object.keys(SCREEN_LABELS) as PreviewScreen[]).map((value) => ({ value, label: SCREEN_LABELS[value] }))

function SaveStatus({ state }: { state: SaveState }) {
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

function ElementNav({ selected, onSelect }: { selected: ElementKey; onSelect: (k: ElementKey) => void }) {
  const group = (g: 'theme' | 'common', title: string) => (
    <div className="flex flex-col gap-1">
      <p className="px-3 pb-1 text-[12px] text-faint">{title}</p>
      {ELEMENT_ORDER.filter((k) => ELEMENTS[k].group === g).map((k) => {
        const { icon: Icon, label } = ELEMENTS[k]
        return (
          <button
            key={k}
            type="button"
            onClick={() => onSelect(k)}
            aria-current={selected === k ? 'true' : undefined}
            className={cn(
              'flex min-h-12 items-center gap-3 rounded-[18px] px-3 text-left text-[14px] transition-colors',
              selected === k ? 'bg-canvas font-semibold text-ink' : 'text-ink-soft hover:bg-canvas',
            )}
          >
            <Icon className="size-[18px] shrink-0 text-sub" aria-hidden />
            {label}
          </button>
        )
      })}
    </div>
  )
  return (
    <nav aria-label="편집 요소" className="flex flex-col gap-6">
      {group('theme', '테마 구성')}
      {group('common', '공통 리소스')}
    </nav>
  )
}

function ElementChips({ selected, onSelect }: { selected: ElementKey | null; onSelect: (k: ElementKey) => void }) {
  return (
    <nav aria-label="편집 요소" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {ELEMENT_ORDER.map((k) => {
        const { icon: Icon, label } = ELEMENTS[k]
        return (
          <button
            key={k}
            type="button"
            onClick={() => onSelect(k)}
            aria-haspopup="dialog"
            className={cn(
              'flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-medium transition-colors',
              selected === k ? 'bg-ink text-white' : 'bg-canvas text-ink hover:bg-canvas-strong',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        )
      })}
    </nav>
  )
}

export function EditorPage({ route }: { route: Extract<Route, { name: 'editor' }> }) {
  const phase = useEditor((s) => s.phase)
  const project = useEditor((s) => s.project)
  const loadError = useEditor((s) => s.loadError)
  const notice = useEditor((s) => s.notice)
  const saveState = useEditor((s) => s.saveState)
  const selected = useEditor((s) => s.selected)
  const screen = useEditor((s) => s.screen)
  const { open, select, setScreen, rename, dismissNotice } = useEditor.getState()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [dialog, setDialog] = useState<'save' | 'export' | null>(null)

  // Load the requested project. Always flush pending local writes first so the
  // previous project's edits are not lost and the new one never races a stale save.
  const requested = route.projectId
  useEffect(() => {
    const current = useEditor.getState()
    if (current.phase === 'ready' && current.project && (requested === null || current.project.id === requested)) return
    let cancelled = false
    void flushAutosave().then(() => {
      if (cancelled) return
      if (requested === 'new') return open({ kind: 'new' })
      if (requested) return open({ kind: 'project', id: requested })
      return open({ kind: 'last' })
    })
    return () => {
      cancelled = true
    }
  }, [requested, open])

  if (phase === 'loading' || phase === 'idle') {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 text-sub" role="status">
        <Spinner className="size-6" />
        테마를 불러오고 있어요.
      </div>
    )
  }
  if (phase === 'not-found' || phase === 'failed' || !project) {
    return (
      <div className="mx-auto flex min-h-[50dvh] max-w-sm flex-col items-center justify-center gap-3 text-center">
        <p className="text-[18px] font-bold">{phase === 'not-found' ? '이 테마를 볼 수 없어요.' : '테마를 불러오지 못했어요.'}</p>
        <p className="text-[14px] text-sub">{phase === 'not-found' ? '삭제되었거나 이 브라우저에 보관되지 않은 테마예요.' : loadError}</p>
        <div className="mt-2 flex gap-2">
          <a href={projectsHref} className="inline-flex min-h-11 items-center rounded-full bg-canvas px-5 text-[14px] font-semibold">
            내 작업
          </a>
          <a href="#/editor/new" className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-[14px] font-semibold text-white">
            새 테마 만들기
          </a>
        </div>
      </div>
    )
  }

  const onSelect = (k: ElementKey) => {
    select(k)
    if (!isDesktop) setSheetOpen(true)
  }

  const info = ELEMENTS[selected]

  const confirmSave = async (name: string) => {
    rename(name)
    if (!(await flushAutosave({ explicit: true }))) {
      const s = useEditor.getState().saveState
      throw new Error(s.kind === 'error' ? s.message : '저장하지 못했어요. 다시 시도해 주세요.')
    }
    toast('이 기기에 저장했어요.')
  }

  const confirmExport = async (name: string) => {
    rename(name)
    // Keep the local copy in sync first (local only; no server write in this version).
    await flushAutosave()
    const s = useEditor.getState()
    try {
      await exportProject(s.project!, s.assets, getRepositories().assets)
    } catch (e) {
      throw new Error(exportErrorMessage(e))
    }
    toast('테마 파일을 내려받았어요.')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-bold leading-tight tracking-[-0.01em] lg:text-[30px]" data-testid="theme-name">
            {project.name}
          </h1>
          <SaveStatus state={saveState} />
        </div>
        <div className="flex shrink-0 gap-2">
          <IconButton label="저장" icon={<Save className="size-5" />} size="lg" onClick={() => setDialog('save')} busy={saveState.kind === 'saving' && dialog === 'save'} />
          <IconButton label="내보내기" icon={<Download className="size-5" />} size="lg" variant="solid" onClick={() => setDialog('export')} />
        </div>
      </div>

      {notice && (
        <div role="status" className="flex items-start gap-3 rounded-[var(--radius-field)] bg-canvas px-4 py-3 text-[14px]">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="flex-1">{notice}</p>
          <IconButton label="알림 닫기" icon={<X className="size-4" />} variant="ghost" className="-my-2 -mr-2" onClick={dismissNotice} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[208px_minmax(0,1fr)_340px] lg:gap-8">
        {isDesktop && (
          <aside>
            <ElementNav selected={selected} onSelect={onSelect} />
          </aside>
        )}

        <section aria-label="미리보기" className="flex min-w-0 flex-col items-center gap-4 rounded-[var(--radius-card)] bg-canvas px-2 py-5 sm:px-6 lg:sticky lg:top-6 lg:self-start lg:py-6">
          <Segmented label="미리보기 화면" hideLabel size="sm" value={screen} options={SCREENS} onChange={setScreen} className="w-full max-w-[360px]" />
          <div className="w-full">
            <ThemePreview config={project.config} screen={screen} />
          </div>
          <p className="text-[12px] text-sub">iOS 미리보기 · 실제 앱과 조금 다를 수 있어요</p>
        </section>

        {isDesktop ? (
          <aside aria-label={`${info.label} 속성`} className="flex min-w-0 flex-col gap-5">
            <header>
              <h2 className="text-[20px] font-bold">{info.label}</h2>
              <p className="text-[13px] text-sub">{info.description}</p>
            </header>
            <ElementPanel element={selected} />
          </aside>
        ) : (
          <>
            <ElementChips selected={sheetOpen ? selected : null} onSelect={onSelect} />
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title={info.label} description={info.description}>
              <div className="pb-4">
                <ElementPanel element={selected} />
              </div>
            </Sheet>
          </>
        )}
      </div>

      <NameDialog
        open={dialog === 'save'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="테마 저장"
        description="이 브라우저에 저장해요. 브라우저 데이터를 지우면 함께 삭제될 수 있어요."
        initialName={project.name}
        confirmLabel="저장"
        busyLabel="저장 중…"
        onConfirm={confirmSave}
      />
      <NameDialog
        open={dialog === 'export'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="테마 내보내기"
        description="아이폰 카카오톡용 .ktheme 파일을 이 브라우저에서 만들어 내려받아요."
        initialName={project.name}
        confirmLabel="내보내기"
        busyLabel="테마를 준비하고 있어요."
        onConfirm={confirmExport}
      >
        <p className="rounded-[var(--radius-field)] bg-canvas px-4 py-3 text-[13px] leading-relaxed text-sub">
          카카오톡 앱에서의 실제 적용은 아직 기기 검증 중이에요. 파일은 서버에 올리지 않아요.
        </p>
      </NameDialog>
    </div>
  )
}
