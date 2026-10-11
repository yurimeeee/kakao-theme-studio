import { create } from 'zustand'
import { importImage } from '@/assets/importImage'
import { objectUrls } from '@/assets/objectUrls'
import type { AssetRecord } from '@/assets/types'
import { getRepositories } from '@/app/services'
import { createNewProject, DEFAULT_THEME_NAME, THEME_NAME_MAX_LENGTH } from '@/domain/theme/defaults'
import { collectAssetIds, removeAssetRefs } from '@/domain/theme/normalize'
import type { AssetId, ElementKey, PreviewScreen, ThemeConfig, ThemeProject } from '@/domain/theme/types'
import { storageErrorMessage } from '@/repositories/types'
import { ELEMENTS } from './elements'

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string }

interface EditorState {
  phase: 'idle' | 'loading' | 'ready' | 'not-found' | 'failed'
  loadError: string | null
  project: ThemeProject | null
  /** Whether a row for this project exists in local storage. */
  persisted: boolean
  /** Blobs for the open project, keyed by asset id. Display URLs come from objectUrls. */
  assets: ReadonlyMap<AssetId, AssetRecord>
  notice: string | null
  /** Incremented on every edit; savedSeq trails it until autosave catches up. */
  editSeq: number
  savedSeq: number
  saveState: SaveState
  selected: ElementKey
  screen: PreviewScreen

  open: (target: { kind: 'project'; id: string } | { kind: 'new' } | { kind: 'last' }) => Promise<void>
  close: () => void
  updateConfig: (recipe: (draft: ThemeConfig) => void) => void
  rename: (name: string) => void
  attachImage: (file: File) => Promise<AssetId>
  select: (element: ElementKey) => void
  setScreen: (screen: PreviewScreen) => void
  dismissNotice: () => void
}

let loadToken = 0
type Listener = () => void
const editListeners = new Set<Listener>()
/** Autosave subscribes here; kept outside the store to avoid a module cycle. */
export const onEdit = (fn: Listener) => {
  editListeners.add(fn)
  return () => editListeners.delete(fn)
}

export function normalizeThemeName(name: string): string {
  return name.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, THEME_NAME_MAX_LENGTH)
}

export const useEditor = create<EditorState>((set, get) => {
  const markEdited = () => {
    set((s) => ({ editSeq: s.editSeq + 1, saveState: { kind: 'pending' } }))
    editListeners.forEach((fn) => fn())
  }

  const loadProject = async (project: ThemeProject, persisted: boolean, token: number) => {
    const { assets: assetRepo } = getRepositories()
    const referenced = collectAssetIds(project.config)
    const records = await assetRepo.getMany(referenced)
    if (token !== loadToken) return
    const missing = new Set([...referenced].filter((id) => !records.has(id)))
    objectUrls.clear()
    set({
      phase: 'ready',
      loadError: null,
      project: missing.size ? { ...project, config: removeAssetRefs(project.config, missing) } : project,
      persisted,
      assets: records,
      notice: missing.size ? `보관된 이미지 ${missing.size}개를 찾을 수 없어 해당 요소를 기본 설정으로 되돌렸어요.` : null,
      editSeq: 0,
      savedSeq: 0,
      saveState: persisted ? { kind: 'saved', at: project.updatedAt } : { kind: 'idle' },
    })
    if (missing.size) markEdited()
  }

  return {
    phase: 'idle',
    loadError: null,
    project: null,
    persisted: false,
    assets: new Map(),
    notice: null,
    editSeq: 0,
    savedSeq: 0,
    saveState: { kind: 'idle' },
    selected: 'bubbleSend',
    screen: 'chatroom',

    open: async (target) => {
      const token = ++loadToken
      const repos = getRepositories()
      set({ phase: 'loading', loadError: null, notice: null })
      try {
        let id: string | null = target.kind === 'project' ? target.id : null
        if (target.kind === 'last') id = await repos.settings.getLastProjectId()
        if (id) {
          const project = await repos.projects.get(id)
          if (token !== loadToken) return
          if (project) return await loadProject(project, true, token)
          if (target.kind === 'project') {
            set({ phase: 'not-found', project: null })
            return
          }
        }
        // New in-memory draft; it is written on the first edit or explicit 저장.
        await loadProject(createNewProject(), false, token)
      } catch (error) {
        if (token !== loadToken) return
        set({ phase: 'failed', loadError: storageErrorMessage(error), project: null })
      }
    },

    close: () => {
      loadToken++
      objectUrls.clear()
      set({ phase: 'idle', project: null, assets: new Map(), persisted: false, notice: null, saveState: { kind: 'idle' } })
    },

    updateConfig: (recipe) => {
      const { project, phase } = get()
      if (!project || phase !== 'ready') return
      const config = structuredClone(project.config)
      recipe(config)
      set({ project: { ...project, config } })
      markEdited()
    },

    rename: (name) => {
      const { project } = get()
      if (!project) return
      const clean = normalizeThemeName(name) || DEFAULT_THEME_NAME
      if (clean === project.name) return
      set({ project: { ...project, name: clean } })
      markEdited()
    },

    attachImage: async (file) => {
      const { project } = get()
      if (!project) throw new Error('No project open')
      const meta = await importImage(project.id, file, getRepositories().assets)
      if (get().project?.id !== project.id) throw new Error('Project changed during upload')
      const next = new Map(get().assets)
      if (!next.has(meta.id)) next.set(meta.id, { ...meta, blob: file })
      set({ assets: next })
      return meta.id
    },

    select: (element) => set({ selected: element, screen: ELEMENTS[element].screen ?? get().screen }),
    setScreen: (screen) => set({ screen }),
    dismissNotice: () => set({ notice: null }),
  }
})
