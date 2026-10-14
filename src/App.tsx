import { Layers, LogIn, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { editorHref, galleryHref, navigate, projectsHref, useRoute } from '@/app/router'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { IconButton } from '@/components/ui/IconButton'
import { toast } from '@/components/ui/toast'
import { Toaster } from '@/components/ui/Toaster'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { AccountDialog } from '@/features/auth/AccountDialog'
import { openLogin } from '@/features/auth/authDialog'
import { LoginDialog } from '@/features/auth/LoginDialog'
import { initSession, onAccountChange, useSession } from '@/features/auth/session'
import { flushAutosave, installAutosave } from '@/features/editor/autosave'
import { EditorPage } from '@/features/editor/EditorPage'
import { useEditor } from '@/features/editor/store'
import { GalleryPage } from '@/features/gallery/GalleryPage'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { ThemeDetailPage } from '@/features/sharing/ThemeDetailPage'

function NavLink({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 text-[13px] font-semibold transition-colors sm:px-5 sm:text-[14px]',
        active ? 'bg-ink text-white' : 'bg-canvas text-sub hover:text-ink',
      )}
    >
      {children}
    </a>
  )
}

function AccountButton() {
  const status = useSession((s) => s.status)
  const [open, setOpen] = useState(false)
  if (status === 'unavailable') return null
  if (status !== 'signed-in') {
    return (
      <Button
        variant="soft"
        className="gap-1.5 whitespace-nowrap px-3 text-[13px] text-ink sm:px-4 sm:text-[14px]"
        busy={status === 'loading'}
        onClick={() => openLogin()}
      >
        {status !== 'loading' && <LogIn className="hidden size-4 sm:block" aria-hidden />}
        로그인
      </Button>
    )
  }
  return (
    <>
      <IconButton label="내 계정" icon={<UserRound className="size-5" />} variant="solid" onClick={() => setOpen(true)} />
      <AccountDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

export default function App() {
  const route = useRoute()
  const cloud = useSession((s) => s.status !== 'unavailable')

  useEffect(() => {
    installAutosave()
    initSession()
    // Private cache protection: when the account changes, a copy linked to the previous
    // account must not stay open (it is written locally first, then closed).
    return onAccountChange((next) => {
      const editor = useEditor.getState()
      const owner = editor.project?.cloudOwnerId
      if (owner && owner !== next?.uid) {
        void flushAutosave().then(() => {
          useEditor.getState().close()
          navigate('#/editor/new', true)
          toast('다른 계정에 연결된 테마라서 닫았어요.')
        })
      }
    })
  }, [])

  // Leaving the editor: write pending edits, then release the project and its object URLs.
  useEffect(() => {
    if (route.name !== 'editor') void flushAutosave().then(() => useEditor.getState().close())
  }, [route.name])

  const page = (() => {
    switch (route.name) {
      case 'projects':
        return <ProjectsPage tab={route.tab} />
      case 'gallery':
        return <GalleryPage />
      case 'share':
        return <ThemeDetailPage shareId={route.shareId} />
      default:
        return <EditorPage route={route} />
    }
  })()

  return (
    <TooltipProvider>
      <div className="mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col px-4 pb-10 sm:px-8 lg:px-12">
        <header className="flex flex-wrap items-center justify-between gap-3 py-5 sm:py-7">
          <a href={editorHref(null)} className="flex min-h-11 items-center gap-2.5 text-[16px] font-semibold">
            <Layers className="size-5" aria-hidden />
            Kakao Theme Studio
          </a>
          <div className="flex items-center gap-1 sm:gap-2">
            <nav aria-label="주요 메뉴" className="flex items-center gap-1 sm:gap-2">
              <NavLink href={editorHref(null)} active={route.name === 'editor'}>
                에디터
              </NavLink>
              <NavLink href={projectsHref} active={route.name === 'projects'}>
                내 작업
              </NavLink>
              {cloud && (
                <NavLink href={galleryHref} active={route.name === 'gallery' || route.name === 'share'}>
                  둘러보기
                </NavLink>
              )}
            </nav>
            <AccountButton />
          </div>
        </header>
        <main className="flex-1">{page}</main>
        <footer className="mt-10 flex justify-between gap-4 text-[12px] text-faint">
          <span>{cloud ? '작업은 이 브라우저에 자동 보관되고, 저장할 때만 클라우드에 올라가요' : '작업은 이 브라우저에 자동 보관돼요'}</span>
          <span className="shrink-0">iOS 테마</span>
        </footer>
      </div>
      <LoginDialog />
      <Toaster />
    </TooltipProvider>
  )
}
