import { AlertCircle, Cloud, Download, Keyboard, Redo2, Save, Share2, Undo2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { projectsHref, type Route } from '@/app/router'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Segmented } from '@/components/ui/Segmented'
import { Sheet } from '@/components/ui/Sheet'
import { LoadingState } from '@/components/ui/States'
import { toast } from '@/components/ui/toast'
import { VISIBILITIES, VISIBILITY_DESCRIPTIONS, VISIBILITY_LABELS } from '@/cloud/model'
import type { ElementKey, PreviewScreen } from '@/domain/theme/types'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { openLogin } from '../auth/authDialog'
import { useSession } from '../auth/session'
import { ExportDialog } from '../export/ExportDialog'
import { ThemePreview } from '../preview/ThemePreview'
import { NameDialog } from '../projects/NameDialog'
import { ShareDialog } from '../sharing/ShareDialog'
import { flushAutosave } from './autosave'
import { ConflictDialog } from './ConflictDialog'
import { ElementChips, ElementNav } from './ElementNav'
import { ELEMENTS, SCREEN_OPTIONS } from './elements'
import { ElementPanel } from './panels/panels'
import { SaveStatus } from './SaveStatus'
import { ShortcutHelpDialog } from './ShortcutHelp'
import { editsText, HELP_LABEL, isMac, REDO_LABEL, UNDO_LABEL, useHelpShortcut } from './shortcuts'
import { useEditor } from './store'
import { useSaveFlow } from './useSaveFlow'

/** The only part of the page that subscribes to the config. */
function EditorPreview({ screen, onSelect }: { screen: PreviewScreen; onSelect: (k: ElementKey) => void }) {
  const config = useEditor((s) => s.project?.config)
  return config ? <ThemePreview config={config} screen={screen} onSelectElement={onSelect} /> : null
}

function useUndoShortcuts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(isMac ? e.metaKey : e.ctrlKey) || e.altKey || editsText(e.target)) return
      const key = e.key.toLowerCase()
      const redo = (key === 'z' && e.shiftKey) || (!isMac && key === 'y' && !e.shiftKey)
      if (!redo && !(key === 'z' && !e.shiftKey)) return
      e.preventDefault()
      const { undo, redo: redoEdit } = useEditor.getState()
      if (redo) redoEdit()
      else undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}

export function EditorPage({ route }: { route: Extract<Route, { name: 'editor' }> }) {
  const phase = useEditor((s) => s.phase)
  // Narrow subscriptions: config edits re-render only the preview and the open panel.
  const hasProject = useEditor((s) => s.project !== null)
  const projectName = useEditor((s) => s.project?.name ?? '')
  const cloudThemeId = useEditor((s) => s.project?.cloudThemeId ?? null)
  const loadError = useEditor((s) => s.loadError)
  const notice = useEditor((s) => s.notice)
  const saveState = useEditor((s) => s.saveState)
  const selected = useEditor((s) => s.selected)
  const screen = useEditor((s) => s.screen)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const { open, select, setScreen, dismissNotice, undo, redo } = useEditor.getState()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [dialog, setDialog] = useState<'save' | 'export' | null>(null)
  const sessionStatus = useSession((s) => s.status)
  const signedIn = sessionStatus === 'signed-in'
  const cloudAvailable = sessionStatus !== 'unavailable'
  const [shareOpen, setShareOpen] = useState(false)
  const flow = useSaveFlow({ signedIn, cloudThemeId })

  // Load the requested project. Always flush pending local writes first so the
  // previous project's edits are not lost and the new one never races a stale save.
  const requested = route.projectId
  // Wait until the account is known: copies linked to an account are shown only to it.
  const sessionReady = sessionStatus !== 'loading'
  useEffect(() => {
    if (!sessionReady) return
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
  }, [requested, open, sessionReady])
  useUndoShortcuts(phase === 'ready')
  const [helpOpen, setHelpOpen] = useState(false)
  useHelpShortcut(phase === 'ready', useCallback(() => setHelpOpen(true), []))

  if (phase === 'loading' || phase === 'idle' || !sessionReady) {
    return (
      <LoadingState size="page">테마를 불러오고 있어요.</LoadingState>
    )
  }
  if (phase === 'not-found' || phase === 'failed' || !hasProject) {
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
  const onPreviewSelect = (k: ElementKey) => {
    select(k, { keepScreen: true })
    if (!isDesktop) setSheetOpen(true)
  }

  const info = ELEMENTS[selected]

  const onShare = () => {
    if (!signedIn) return openLogin('공유하려면 로그인해 주세요.')
    if (!cloudThemeId) {
      toast('공유하려면 테마를 먼저 저장해 주세요.')
      return setDialog('save')
    }
    setShareOpen(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 sm:flex-nowrap">
        <div className="min-w-0 basis-full sm:basis-auto">
          <h1 className="truncate text-[26px] font-bold leading-tight tracking-[-0.01em] lg:text-[30px]" data-testid="theme-name">
            {projectName}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3">
            <SaveStatus state={saveState} />
            {signedIn && cloudThemeId && (
              <span className="flex items-center gap-1 text-[13px] text-sub" data-testid="cloud-linked">
                <Cloud className="size-3.5" aria-hidden />
                클라우드 연결
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2 max-sm:w-full max-sm:justify-end">
          <div className="flex gap-1">
            <IconButton label={UNDO_LABEL} aria-label="실행 취소" icon={<Undo2 className="size-5" />} variant="ghost" disabled={!canUndo} onClick={undo} />
            <IconButton label={REDO_LABEL} aria-label="다시 실행" icon={<Redo2 className="size-5" />} variant="ghost" disabled={!canRedo} onClick={redo} />
            <IconButton label={HELP_LABEL} aria-label="단축키와 조작법" icon={<Keyboard className="size-5" />} variant="ghost" className="max-sm:hidden" onClick={() => setHelpOpen(true)} />
          </div>
          {cloudAvailable && <IconButton label="공유" icon={<Share2 className="size-5" />} size="lg" onClick={onShare} />}
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
          <Segmented label="미리보기 화면" hideLabel size="sm" value={screen} options={SCREEN_OPTIONS} onChange={setScreen} className="w-full max-w-[360px]" />
          <div className="w-full">
            <EditorPreview screen={screen} onSelect={onPreviewSelect} />
          </div>
          <p className="text-center text-[12px] text-sub">미리보기를 눌러 요소를 고를 수 있어요 · 실제 앱과 조금 다를 수 있어요</p>
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
        description={
          signedIn
            ? '이 브라우저에 저장하고, 이미지와 설정을 내 계정 클라우드에도 저장해요.'
            : '이 브라우저에 저장해요. 브라우저 데이터를 지우면 함께 삭제될 수 있어요.'
        }
        initialName={projectName}
        confirmLabel="저장"
        busyLabel="저장 중…"
        onConfirm={flow.confirmSave}
      >
        {signedIn && !cloudThemeId && (
          <div className="flex flex-col gap-2">
            <Segmented label="공개 범위" value={flow.visibility} options={VISIBILITIES.map((v) => ({ value: v, label: VISIBILITY_LABELS[v] }))} onChange={flow.setVisibility} />
            <p className="text-[12px] leading-relaxed text-sub">{VISIBILITY_DESCRIPTIONS[flow.visibility]}</p>
          </div>
        )}
        {signedIn && cloudThemeId && (
          <p className="rounded-[var(--radius-field)] bg-canvas px-4 py-3 text-[13px] leading-relaxed text-sub">
            공개 범위는 공유 버튼에서 바꿀 수 있어요. 공개 중인 테마는 저장하면 공개된 내용도 바뀌어요.
          </p>
        )}
        {cloudAvailable && !signedIn && (
          <Button
            variant="soft"
            onClick={() => {
              setDialog(null)
              openLogin('로그인한 뒤 다시 저장하면 클라우드에도 보관돼요.')
            }}
          >
            로그인하고 클라우드에도 저장
          </Button>
        )}
      </NameDialog>
      <ExportDialog
        open={dialog === 'export'}
        onOpenChange={(o) => !o && setDialog(null)}
        initialName={projectName}
        onConfirm={flow.confirmExport}
        note={signedIn ? '내보내기 전에 이미지와 설정을 클라우드에 저장해요. .ktheme 파일은 이 브라우저에서 만들고 서버에 보관하지 않아요.' : undefined}
      />

      {signedIn && (
        <ShareDialog themeId={shareOpen ? cloudThemeId : null} themeName={projectName} onOpenChange={setShareOpen} />
      )}

      <ShortcutHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <ConflictDialog conflict={flow.conflict} busy={flow.conflictBusy} onResolve={(c) => void flow.resolveConflict(c)} onDismiss={flow.dismissConflict} />
    </div>
  )
}
