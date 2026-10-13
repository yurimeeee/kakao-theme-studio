import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRepositories } from '@/app/services'
import { createNewProject } from '@/domain/theme/defaults'
import type { ThemeProject } from '@/domain/theme/types'
import { StorageError } from '@/repositories/types'
import { useSession } from '../auth/session'
import { flushAutosave, installAutosave } from './autosave'
import { useEditor } from './store'

// Minimal browser surface for autosave + router (the unit suite runs in Node; jsdom needs Node 22).
const events = new EventTarget()
const location = { hash: '' }
vi.stubGlobal('window', {
  setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
  clearTimeout: (id?: number) => clearTimeout(id),
  location,
  addEventListener: events.addEventListener.bind(events),
  removeEventListener: events.removeEventListener.bind(events),
  dispatchEvent: events.dispatchEvent.bind(events),
})
vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => undefined })
vi.stubGlobal('history', { replaceState: (_s: unknown, _t: string, href: string) => void (location.hash = href) })
vi.stubGlobal('HashChangeEvent', class extends Event {})

installAutosave()

/** Lets IndexedDB (fake-indexeddb runs on setImmediate, not on the faked setTimeout) finish its work. */
async function idle(rounds = 30) {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r))
}

const editor = () => useEditor.getState()
const accent = (hex: string) => editor().updateConfig((c) => void (c.palette.accent = hex))
const stored = (id: string) => getRepositories().projects.get(id)

async function persistedProject(patch: Partial<ThemeProject> = {}): Promise<ThemeProject> {
  return getRepositories().projects.save({ ...createNewProject(), ...patch }, { snapshotAt: Date.now() })
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  const { db } = getRepositories()
  await Promise.all(db.tables.map((t) => t.clear()))
  useSession.setState({ status: 'signed-out', user: null })
  editor().close()
})

afterEach(async () => {
  editor().close()
  await flushAutosave()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('autosave', () => {
  it('writes a new draft only after the debounce, then reports 보관됨 and links the URL', async () => {
    await editor().open({ kind: 'new' })
    const id = editor().project!.id
    expect(editor().saveState.kind).toBe('idle')

    accent('#111111')
    expect(editor().saveState.kind).toBe('pending')
    vi.advanceTimersByTime(600)
    await idle()
    expect(await stored(id)).toBeNull()

    vi.advanceTimersByTime(200)
    await idle()
    expect((await stored(id))?.config.palette.accent).toBe('#111111')
    expect(editor()).toMatchObject({ persisted: true, saveState: { kind: 'saved' } })
    expect(editor().savedSeq).toBe(editor().editSeq)
    expect(location.hash).toBe(`#/editor/${id}`)
  })

  it('saves within the max wait while edits keep coming', async () => {
    await editor().open({ kind: 'new' })
    const id = editor().project!.id
    // An edit every 500ms never lets the 700ms debounce fire; the 4s max wait must.
    for (let t = 0; t < 3500; t += 500) {
      accent(`#00000${t / 500}`)
      vi.advanceTimersByTime(500)
      await idle(3)
    }
    expect(await stored(id)).toBeNull()
    accent('#000009') // t=3500: the debounce would only fire at 4200
    vi.advanceTimersByTime(500) // t=4000
    await idle()
    expect((await stored(id))?.config.palette.accent).toBe('#000009')
  })

  it('an edit made while a write is in flight is written by a follow-up save', async () => {
    const project = await persistedProject()
    await editor().open({ kind: 'project', id: project.id })

    const repo = getRepositories().projects
    const realSave = repo.save.bind(repo)
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    vi.spyOn(repo, 'save').mockImplementationOnce(async (p, o) => {
      await gate
      return realSave(p, o)
    })

    accent('#aaaaaa')
    const first = flushAutosave()
    await idle()
    expect(editor().saveState.kind).toBe('saving')
    accent('#bbbbbb') // not in the snapshot being written
    release()
    await first
    expect((await stored(project.id))?.config.palette.accent).toBe('#aaaaaa')
    expect(editor().saveState.kind).toBe('pending')

    vi.advanceTimersByTime(700)
    await idle()
    expect((await stored(project.id))?.config.palette.accent).toBe('#bbbbbb')
    expect(editor().saveState.kind).toBe('saved')
  })

  it('does not write when nothing changed', async () => {
    const project = await persistedProject()
    await editor().open({ kind: 'project', id: project.id })
    const save = vi.spyOn(getRepositories().projects, 'save')
    expect(await flushAutosave()).toBe(true)
    expect(save).not.toHaveBeenCalled()
  })

  it('shows the error and keeps the edit until a retry succeeds', async () => {
    const project = await persistedProject()
    await editor().open({ kind: 'project', id: project.id })
    vi.spyOn(getRepositories().projects, 'save').mockRejectedValueOnce(new StorageError('quota', 'full'))

    accent('#cccccc')
    expect(await flushAutosave()).toBe(false)
    expect(editor().saveState).toMatchObject({ kind: 'error', message: expect.stringContaining('저장 공간') })
    expect(editor().savedSeq).not.toBe(editor().editSeq)

    expect(await flushAutosave()).toBe(true)
    expect((await stored(project.id))?.config.palette.accent).toBe('#cccccc')
    expect(editor().saveState.kind).toBe('saved')
  })

  it('a write that finishes after switching projects does not touch the new project', async () => {
    const a = await persistedProject({ name: 'A' })
    const b = await persistedProject({ name: 'B' })
    await editor().open({ kind: 'project', id: a.id })

    const repo = getRepositories().projects
    const realSave = repo.save.bind(repo)
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    vi.spyOn(repo, 'save').mockImplementationOnce(async (p, o) => {
      await gate
      return realSave(p, o)
    })

    accent('#dddddd')
    const write = flushAutosave()
    await idle()
    await editor().open({ kind: 'project', id: b.id })
    release()
    await write

    expect(editor().project).toMatchObject({ id: b.id, name: 'B', revision: b.revision })
    expect(editor().saveState.kind).toBe('saved')
    expect((await stored(a.id))?.config.palette.accent).toBe('#dddddd')
  })
})

describe('editor open', () => {
  it('the last requested project wins when opens overlap', async () => {
    const a = await persistedProject({ name: 'A' })
    const b = await persistedProject({ name: 'B' })
    const first = editor().open({ kind: 'project', id: a.id })
    const second = editor().open({ kind: 'project', id: b.id })
    await Promise.all([first, second])
    expect(editor()).toMatchObject({ phase: 'ready', project: { id: b.id } })
  })

  it('reopens the last project, and falls back to a new draft when there is none', async () => {
    await editor().open({ kind: 'last' })
    expect(editor()).toMatchObject({ phase: 'ready', persisted: false })

    const p = await persistedProject({ name: '마지막' })
    await getRepositories().settings.setLastProjectId(p.id)
    await editor().open({ kind: 'last' })
    expect(editor()).toMatchObject({ phase: 'ready', persisted: true, project: { id: p.id } })
  })

  it('hides a copy linked to another account (private cache protection)', async () => {
    const p = await persistedProject({ cloudThemeId: 'th1', cloudOwnerId: 'someone-else' })
    await editor().open({ kind: 'project', id: p.id })
    expect(editor()).toMatchObject({ phase: 'not-found', project: null })

    useSession.setState({ status: 'signed-in', user: { uid: 'someone-else' } as never })
    await editor().open({ kind: 'project', id: p.id })
    expect(editor()).toMatchObject({ phase: 'ready', project: { id: p.id } })
  })

  it('drops references to missing images and schedules a save of the repaired config', async () => {
    const p = await persistedProject()
    p.config.background.main = { mode: 'image', color: '#ffffff', imageAssetId: 'ast_missing' }
    const saved = await getRepositories().projects.save(p, { snapshotAt: Date.now() })
    await editor().open({ kind: 'project', id: saved.id })
    expect(editor().project!.config.background.main.imageAssetId).toBeNull()
    expect(editor().notice).toContain('1개')
    expect(editor().saveState.kind).toBe('pending')
  })
})
