import { useRef, useState, type ReactNode } from 'react'
import { editorHref, navigate } from '@/app/router'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { toast, toastError } from '@/components/ui/toast'
import { BACKUP_EXTENSION } from './backup'
import { importFailureMessage, importThemeFile, type ImportResult } from './importFile'

export interface KthemeImport {
  busy: boolean
  /** Opens the file picker. */
  choose(): void
  importFile(file: File): Promise<void>
  /** Hidden input + result dialog; render once. */
  element: ReactNode
}

/** 가져오기: a .ktheme or a backup file opens as a new project. Shows what could not be carried over first. */
export function useKthemeImport(): KthemeImport {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const importFile = async (file: File) => {
    if (busy) return
    setBusy(true)
    try {
      const imported = await importThemeFile(file)
      if (imported.notes.length) setResult(imported)
      else {
        toast(imported.kind === 'backup' ? `'${imported.name}' 백업을 불러왔어요.` : `'${imported.name}' 테마를 가져왔어요.`)
        navigate(editorHref(imported.projectId))
      }
    } catch (e) {
      toastError(importFailureMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const element = (
    <>
      <input
        ref={input}
        type="file"
        accept={`.ktheme,.zip,${BACKUP_EXTENSION}`}
        className="hidden"
        aria-label="테마 파일 선택"
        data-testid="import-ktheme-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void importFile(file)
          e.target.value = ''
        }}
      />
      <Dialog
        open={result !== null}
        onOpenChange={(o) => !o && setResult(null)}
        title={result?.kind === 'backup' ? '백업을 불러왔어요' : '테마를 가져왔어요'}
        description={result?.kind === 'backup' ? '다음 내용을 확인해 주세요. 백업 파일은 그대로예요.' : '편집기에서 지원하지 않는 부분은 다음처럼 바뀌었어요. 원본 파일은 그대로예요.'}
        footer={<Button onClick={() => result && navigate(editorHref(result.projectId))}>편집하기</Button>}
      >
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[14px]">
          {result?.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      </Dialog>
    </>
  )

  return { busy, choose: () => input.current?.click(), importFile, element }
}
