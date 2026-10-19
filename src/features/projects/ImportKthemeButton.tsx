import { FileUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { KthemeImport } from './useKthemeImport'

export function ImportKthemeButton({ importer, className }: { importer: KthemeImport; className?: string }) {
  return (
    <Button variant="soft" busy={importer.busy} onClick={importer.choose} className={className}>
      {!importer.busy && <FileUp className="size-4" aria-hidden />}가져오기
    </Button>
  )
}

const carriesFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false

/** Dropping a file anywhere on the page imports it; an overlay shows while a file is dragged over. */
export function KthemeDropZone({ importer }: { importer: KthemeImport }) {
  const [dragging, setDragging] = useState(false)
  const importFile = useRef(importer.importFile)
  useEffect(() => {
    importFile.current = importer.importFile
  })

  useEffect(() => {
    // dragenter/dragleave fire for every child element, so count them to know when the file left the window.
    let depth = 0
    const enter = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      depth++
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const over = (e: DragEvent) => {
      if (carriesFiles(e)) e.preventDefault() // allows the drop
    }
    const drop = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const file = e.dataTransfer?.files[0]
      if (file) void importFile.current(file)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])

  if (!dragging) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" data-testid="ktheme-drop-overlay">
      <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed border-ink/40 bg-surface px-10 py-8 text-center shadow-[var(--shadow-pop)]">
        <FileUp className="size-8" aria-hidden />
        <p className="text-[16px] font-semibold">놓으면 테마를 가져와요</p>
        <p className="text-[13px] text-sub">.ktheme 파일을 새 프로젝트로 열어요</p>
      </div>
    </div>
  )
}
