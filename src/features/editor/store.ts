import { create } from 'zustand'
import { importImage } from '@/assets/importImage'
import { objectUrls } from '@/assets/objectUrls'
import type { AssetRecord } from '@/assets/types'
import { getRepositories } from '@/app/services'
import { createNewProject, DEFAULT_THEME_NAME, THEME_NAME_MAX_LENGTH } from '@/domain/theme/defaults'
import { collectAssetIds, removeAssetRefs } from '@/domain/theme/normalize'
import type { AssetId, ElementKey, PreviewScreen, ThemeConfig, ThemeProject } from '@/domain/theme/types'
import { storageErrorMessage } from '@/repositories/types'
import { isVisibleLocally } from '../auth/session'
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
  /** Config snapshots for 실행 취소 / 다시 실행 (oldest first). Cleared when a project opens. */
  past: ThemeConfig[]
  future: ThemeConfig[]

  open: (target: { kind: 'project'; id: string } | { kind: 'new' } | { kind: 'last' }) => Promise<void>
  close: () => void
  /** `newStep`: never merge into the previous undo step (one-off actions such as a reset). */
  updateConfig: (recipe: (draft: ThemeConfig) => void, options?: { newStep?: boolean }) => void
  rename: (name: string) => void
  attachImage: (file: File) => Promise<AssetId>
  undo: () => void
  redo: () => void
  /** `keepScreen`: selecting from the preview should not switch the screen being looked at. */
  select: (element: ElementKey, options?: { keepScreen?: boolean }) => void
  setScreen: (screen: PreviewScreen) => void
  dismissNotice: () => void
}

let loadToken = 0
const HISTORY_LIMIT = 100
/** Quick edits to the same settings (a slider or color drag, typing a hex) form one undo step. */
const COALESCE_MS = 500
let lastEdit = { at: 0, paths: '' }

/** Leaf paths that differ between two configs, e.g. `bubbles.send.radius`. */
function changedPaths(a: unknown, b: unknown, path = '', out: string[] = []): string[] {
  if (a === b) return out
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    out.push(path)
    return out
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) changedPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out)
  return out
}
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
      past: [],
      future: [],
    })
    if (missing.size) markEdited()
  }

  /** Swap in a config from history. Images it references may have been cleaned up by autosave since. */
  const restore = (config: ThemeConfig, past: ThemeConfig[], future: ThemeConfig[]) => {
    const { project, assets } = get()
    if (!project) return
    const before = collectAssetIds(project.config)
    const revived = [...collectAssetIds(config)].filter((id) => !before.has(id))
    const now = Date.now()
    // Re-store from memory; a fresh lastAttachedAt keeps an in-flight save from deleting them again.
    for (const id of revived) {
      const record = assets.get(id)
      if (record) void getRepositories().assets.put({ ...record, lastAttachedAt: now }).catch(() => undefined)
    }
    lastEdit = { at: 0, paths: '' }
    set({ project: { ...project, config }, past, future })
    markEdited()
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
    past: [],
    future: [],

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
          // A copy linked to another (or a signed-out) account is not shown: private cache protection.
          if (project && isVisibleLocally(project.cloudOwnerId)) return await loadProject(project, true, token)
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
      set({ phase: 'idle', project: null, assets: new Map(), persisted: false, notice: null, saveState: { kind: 'idle' }, past: [], future: [] })
    },

    updateConfig: (recipe, options) => {
      const { project, phase } = get()
      if (!project || phase !== 'ready') return
      const config = structuredClone(project.config)
      recipe(config)
      const now = Date.now()
      const paths = changedPaths(project.config, config).join(' ')
      // Configs are replaced, never mutated, so the previous object is a safe snapshot.
      const coalesce = !options?.newStep && now - lastEdit.at < COALESCE_MS && paths === lastEdit.paths && get().past.length > 0
      lastEdit = options?.newStep ? { at: 0, paths: '' } : { at: now, paths }
      const past = coalesce ? get().past : [...get().past, project.config].slice(-HISTORY_LIMIT)
      set({ project: { ...project, config }, past, future: [] })
      markEdited()
    },

    undo: () => {
      const { past, future, project, phase } = get()
      if (!project || phase !== 'ready' || !past.length) return
      restore(past[past.length - 1], past.slice(0, -1), [project.config, ...future])
    },

    redo: () => {
      const { past, future, project, phase } = get()
      if (!project || phase !== 'ready' || !future.length) return
      restore(future[0], [...past, project.config], future.slice(1))
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

    select: (element, options) =>
      set({ selected: element, screen: (options?.keepScreen ? null : ELEMENTS[element].screen) ?? get().screen }),
    setScreen: (screen) => set({ screen }),
    dismissNotice: () => set({ notice: null }),
  }
})
