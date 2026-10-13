import { useState } from 'react'
import { getRepositories } from '@/app/services'
import { toast } from '@/components/ui/toast'
import { CloudError, cloudErrorMessage } from '@/cloud/errors'
import type { Visibility } from '@/cloud/model'
import { openCloudTheme, saveOpenProjectToCloud } from '../cloud/cloudSync'
import { exportErrorMessage, exportProject } from '../export/exportProject'
import { flushAutosave } from './autosave'
import { useEditor } from './store'

export type CloudConflict = 'conflict' | 'gone'

const asConflict = (e: unknown): CloudConflict | null =>
  e instanceof CloudError && (e.kind === 'conflict' || e.kind === 'gone') ? e.kind : null

/**
 * 저장 / 내보내기 confirmation for the open project, and the cloud conflict that either can
 * hit. Confirm handlers throw an Error with a Korean message for the name dialog to show.
 */
export function useSaveFlow({ signedIn, cloudThemeId }: { signedIn: boolean; cloudThemeId: string | null }) {
  /** 공개 범위 for the first cloud save (later changes go through 공유). */
  const [visibility, setVisibility] = useState<Visibility>('private')
  const [conflict, setConflict] = useState<CloudConflict | null>(null)
  const [conflictBusy, setConflictBusy] = useState<'cloud' | 'new' | null>(null)
  const { rename, open } = useEditor.getState()

  const confirmSave = async (name: string) => {
    rename(name)
    if (!(await flushAutosave({ explicit: true }))) {
      const s = useEditor.getState().saveState
      throw new Error(s.kind === 'error' ? s.message : '저장하지 못했어요. 다시 시도해 주세요.')
    }
    if (!signedIn) {
      toast('이 기기에 저장했어요.')
      return
    }
    // Signed in: the explicit 저장 is the only moment work is uploaded.
    try {
      const out = await saveOpenProjectToCloud({ visibility: cloudThemeId ? undefined : visibility })
      toast(out.publishWarning ?? '클라우드에 저장했어요.')
    } catch (e) {
      const kind = asConflict(e)
      if (kind) return setConflict(kind)
      throw new Error(`이 기기에는 저장했어요. ${cloudErrorMessage(e)}`)
    }
  }

  const confirmExport = async (name: string) => {
    rename(name)
    await flushAutosave()
    if (signedIn) {
      // Signed-in export saves to the cloud first and does not silently fall back to local-only.
      try {
        await saveOpenProjectToCloud()
      } catch (e) {
        const kind = asConflict(e)
        if (kind) return setConflict(kind)
        throw new Error(cloudErrorMessage(e))
      }
    }
    const s = useEditor.getState()
    try {
      await exportProject(s.project!, s.assets, getRepositories().assets)
    } catch (e) {
      throw new Error(exportErrorMessage(e))
    }
    toast('테마 파일을 내려받았어요.')
  }

  const resolveConflict = async (choice: 'cloud' | 'new') => {
    if (conflictBusy) return
    setConflictBusy(choice)
    try {
      if (choice === 'cloud') {
        const r = await openCloudTheme(cloudThemeId!, { replace: true })
        await open({ kind: 'project', id: r.localId })
        toast('클라우드 버전을 불러왔어요.')
      } else {
        await saveOpenProjectToCloud({ asNewTheme: true, visibility: 'private' })
        toast('새 테마로 클라우드에 저장했어요.')
      }
      setConflict(null)
    } catch (e) {
      toast(cloudErrorMessage(e))
    } finally {
      setConflictBusy(null)
    }
  }

  return {
    visibility,
    setVisibility,
    confirmSave,
    confirmExport,
    conflict,
    conflictBusy,
    resolveConflict,
    dismissConflict: () => setConflict(null),
  }
}
