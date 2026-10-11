import { getRepositories } from '@/app/services'
import { editorHref, navigate } from '@/app/router'
import { storageErrorMessage } from '@/repositories/types'
import { renderThumbnail } from '../projects/thumbnail'
import { onEdit, useEditor } from './store'

/**
 * Local autosave (IndexedDB only — no network). Writes are serialized; each write
 * persists an immutable snapshot of the project taken when the write starts.
 *
 * - debounce after the last edit, plus a max-wait so continuous editing still saves
 * - status shows "보관됨" only after the transaction committed
 * - flush on tab hide / page hide as a best-effort extra, not the only trigger
 */
const DEBOUNCE_MS = 700
const MAX_WAIT_MS = 4000

let debounceTimer: number | undefined
let maxWaitTimer: number | undefined
let chain: Promise<boolean> = Promise.resolve(true)

function clearTimers() {
  window.clearTimeout(debounceTimer)
  window.clearTimeout(maxWaitTimer)
  debounceTimer = undefined
  maxWaitTimer = undefined
}

export function scheduleAutosave(): void {
  window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => void flushAutosave(), DEBOUNCE_MS)
  maxWaitTimer ??= window.setTimeout(() => void flushAutosave(), MAX_WAIT_MS)
}

/** Queue a write of the current state. Resolves true when everything is stored. */
export function flushAutosave(options: { explicit?: boolean } = {}): Promise<boolean> {
  clearTimers()
  chain = chain.then(() => writeSnapshot(options.explicit ?? false))
  return chain
}

async function writeSnapshot(explicit: boolean): Promise<boolean> {
  const state = useEditor.getState()
  const { project } = state
  if (state.phase !== 'ready' || !project) return true
  if (!explicit && state.savedSeq === state.editSeq) return true

  const seq = state.editSeq
  const snapshot = structuredClone(project)
  const snapshotAt = Date.now()
  useEditor.setState({ saveState: { kind: 'saving' } })

  try {
    const repos = getRepositories()
    const thumbnail = await renderThumbnail(snapshot.config, state.assets).catch(() => null)
    const saved = await repos.projects.save(snapshot, { snapshotAt, thumbnail, explicit })
    // Ask the browser not to evict local work under storage pressure (best effort, may be denied).
    if (explicit) void navigator.storage?.persist?.().catch(() => false)
    await repos.settings.setLastProjectId(saved.id).catch(() => undefined)

    const current = useEditor.getState()
    if (current.project?.id !== saved.id) return true
    const caughtUp = current.editSeq === seq
    useEditor.setState({
      project: {
        ...current.project,
        revision: saved.revision,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
        savedAt: saved.savedAt,
      },
      persisted: true,
      savedSeq: seq,
      saveState: caughtUp ? { kind: 'saved', at: saved.updatedAt } : { kind: 'pending' },
    })
    if (!current.persisted) navigate(editorHref(saved.id), true)
    if (!caughtUp) scheduleAutosave()
    return true
  } catch (error) {
    if (useEditor.getState().project?.id === snapshot.id) {
      useEditor.setState({ saveState: { kind: 'error', message: storageErrorMessage(error) } })
    }
    return false
  }
}

let installed = false

/** Wire autosave to edits and page lifecycle. Idempotent. */
export function installAutosave(): void {
  if (installed) return
  installed = true
  onEdit(scheduleAutosave)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushAutosave()
  })
  window.addEventListener('pagehide', () => void flushAutosave())
  window.addEventListener('beforeunload', (e) => {
    const s = useEditor.getState()
    if (s.phase === 'ready' && s.editSeq !== s.savedSeq) {
      void flushAutosave()
      e.preventDefault()
    }
  })
}
