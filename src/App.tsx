import { Layers } from 'lucide-react'
import { useEffect } from 'react'
import { editorHref, projectsHref, useRoute } from '@/app/router'
import { cn } from '@/components/ui/cn'
import { Toaster } from '@/components/ui/Toaster'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { flushAutosave, installAutosave } from '@/features/editor/autosave'
import { EditorPage } from '@/features/editor/EditorPage'
import { useEditor } from '@/features/editor/store'
import { ProjectsPage } from '@/features/projects/ProjectsPage'

function NavLink({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-11 items-center rounded-full px-5 text-[14px] font-semibold transition-colors',
        active ? 'bg-ink text-white' : 'bg-canvas text-sub hover:text-ink',
      )}
    >
      {children}
    </a>
  )
}

export default function App() {
  const route = useRoute()

  useEffect(() => {
    installAutosave()
  }, [])

  // Leaving the editor: write pending edits, then release the project and its object URLs.
  useEffect(() => {
    if (route.name === 'projects') void flushAutosave().then(() => useEditor.getState().close())
  }, [route.name])

  return (
    <TooltipProvider>
      <div className="mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col px-4 pb-10 sm:px-8 lg:px-12">
        <header className="flex flex-wrap items-center justify-between gap-3 py-5 sm:py-7">
          <a href={editorHref(null)} className="flex min-h-11 items-center gap-2.5 text-[16px] font-semibold">
            <Layers className="size-5" aria-hidden />
            Kakao Theme Studio
          </a>
          <nav aria-label="주요 메뉴" className="flex items-center gap-2">
            <NavLink href={editorHref(null)} active={route.name === 'editor'}>
              에디터
            </NavLink>
            <NavLink href={projectsHref} active={route.name === 'projects'}>
              내 작업
            </NavLink>
          </nav>
        </header>
        <main className="flex-1">{route.name === 'projects' ? <ProjectsPage /> : <EditorPage route={route} />}</main>
        <footer className="mt-10 flex justify-between gap-4 text-[12px] text-faint">
          <span>작업은 이 브라우저에 자동 보관돼요</span>
          <span>iOS 테마</span>
        </footer>
      </div>
      <Toaster />
    </TooltipProvider>
  )
}
