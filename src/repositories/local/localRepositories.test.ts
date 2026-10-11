import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importImage } from '@/assets/importImage'
import { createNewProject } from '@/domain/theme/defaults'
import type { ThemeProject } from '@/domain/theme/types'
import { fakePng } from '@/test/fakeRasterizer'
import { StorageError } from '../types'
import { createLocalRepositories, type LocalRepositories } from './localRepositories'

const decode = async () => ({ width: 30, height: 30 })
let repos: LocalRepositories
let dbCount = 0

beforeEach(() => {
  repos = createLocalRepositories(`test-db-${++dbCount}`)
})
afterEach(async () => {
  await repos.db.delete()
})

async function save(p: ThemeProject, snapshotAt = Date.now() + 1) {
  return repos.projects.save(p, { snapshotAt })
}

describe('LocalProjectRepository', () => {
  it('round-trips config and image Blob bytes (refresh restore)', async () => {
    const p = createNewProject()
    const png = fakePng(64, 32)
    const asset = await importImage(p.id, png, repos.assets, decode)
    p.config.background.main = { mode: 'image', color: '#ffffff', imageAssetId: asset.id }
    p.name = '나의 테마'
    await save(p)

    // Simulate a reload: a brand-new repository instance on the same database.
    const reopened = createLocalRepositories(repos.db.name)
    const loaded = await reopened.projects.get(p.id)
    expect(loaded?.name).toBe('나의 테마')
    expect(loaded?.config.background.main.imageAssetId).toBe(asset.id)
    const stored = await reopened.assets.get(asset.id)
    expect(stored).not.toBeNull()
    const bytes = new Uint8Array(await stored!.blob.arrayBuffer())
    expect(bytes).toEqual(new Uint8Array(await png.arrayBuffer()))
    reopened.db.close()
  })

  it('isolates projects: editing one never changes another', async () => {
    const a = createNewProject()
    const b = createNewProject()
    const savedA = await save(a)
    await save(b)
    const editedA = { ...savedA, config: structuredClone(savedA.config) }
    editedA.config.palette.accent = '#ff0000'
    await save(editedA)
    expect((await repos.projects.get(b.id))?.config.palette.accent).toBe(b.config.palette.accent)
    expect((await repos.projects.get(a.id))?.config.palette.accent).toBe('#ff0000')
  })

  it('does not share assets between projects even for identical files', async () => {
    const a = createNewProject()
    const b = createNewProject()
    const png = fakePng(8, 8)
    const assetA = await importImage(a.id, png, repos.assets, decode)
    const assetB = await importImage(b.id, png, repos.assets, decode)
    expect(assetA.id).not.toBe(assetB.id)
    // Same project + same bytes is deduplicated.
    expect((await importImage(a.id, png, repos.assets, decode)).id).toBe(assetA.id)
  })

  it('increments revision and rejects stale writes (conflict)', async () => {
    const p = createNewProject()
    const first = await save(p)
    expect(first.revision).toBe(1)
    await save(first)
    await expect(save(first)).rejects.toMatchObject({ kind: 'conflict' })
  })

  it('removes unreferenced assets on save, but keeps assets attached after the snapshot', async () => {
    const p = createNewProject()
    const old = await importImage(p.id, fakePng(1, 1), repos.assets, decode)
    let saved = await save({ ...p, config: { ...p.config, profile: { mode: 'image', imageAssetId: old.id } } })

    // The user removes the image; meanwhile a new image is attached *after* the snapshot.
    const snapshotAt = Date.now()
    await new Promise((r) => setTimeout(r, 5))
    const fresh = await importImage(p.id, fakePng(2, 2), repos.assets, decode)
    saved = await repos.projects.save({ ...saved, config: { ...saved.config, profile: { mode: 'default', imageAssetId: null } } }, { snapshotAt })

    expect(await repos.assets.get(old.id)).toBeNull()
    expect(await repos.assets.get(fresh.id)).not.toBeNull()
  })

  it('a re-attached (deduplicated) image survives an in-flight save of an older snapshot', async () => {
    const p = createNewProject()
    const png = fakePng(3, 3)
    const a = await importImage(p.id, png, repos.assets, decode)
    const saved = await save({ ...p, config: { ...p.config, profile: { mode: 'image', imageAssetId: a.id } } })
    // Removed, then the same file chosen again → dedupe refreshes lastAttachedAt.
    const snapshotAt = Date.now()
    await new Promise((r) => setTimeout(r, 5))
    const again = await importImage(p.id, png, repos.assets, decode)
    expect(again.id).toBe(a.id)
    await repos.projects.save({ ...saved, config: { ...saved.config, profile: { mode: 'default', imageAssetId: null } } }, { snapshotAt })
    expect(await repos.assets.get(a.id)).not.toBeNull()
  })

  it('delete removes project, thumbnail and all of its assets only', async () => {
    const a = createNewProject()
    const b = createNewProject()
    const assetA = await importImage(a.id, fakePng(4, 4), repos.assets, decode)
    const assetB = await importImage(b.id, fakePng(5, 5), repos.assets, decode)
    await repos.projects.save({ ...a, config: { ...a.config, profile: { mode: 'image', imageAssetId: assetA.id } } }, { snapshotAt: Date.now(), thumbnail: fakePng(1, 1) })
    await save({ ...b, config: { ...b.config, profile: { mode: 'image', imageAssetId: assetB.id } } })
    await repos.settings.setLastProjectId(a.id)

    await repos.projects.delete(a.id)

    expect(await repos.projects.get(a.id)).toBeNull()
    expect(await repos.assets.listMeta(a.id)).toHaveLength(0)
    expect(await repos.assets.get(assetB.id)).not.toBeNull()
    expect((await repos.projects.list()).map((s) => s.id)).toEqual([b.id])
    expect(await repos.settings.getLastProjectId()).toBeNull()
  })

  it('lists newest first with thumbnails', async () => {
    const a = createNewProject()
    const b = createNewProject()
    await save(a)
    await new Promise((r) => setTimeout(r, 5))
    await repos.projects.save(b, { snapshotAt: Date.now(), thumbnail: fakePng(2, 2) })
    const list = await repos.projects.list()
    expect(list.map((s) => s.id)).toEqual([b.id, a.id])
    expect(list[0].thumbnail).not.toBeNull()
    expect(list[0].location).toBe('local')
  })

  it('repairs a stored row with corrupted config through migration on read', async () => {
    const p = createNewProject()
    await save(p)
    await repos.db.projects.update(p.id, { config: { palette: { accent: 'nope' } } })
    const loaded = await repos.projects.get(p.id)
    expect(loaded?.config.palette.accent).toBe('#d9d9df')
  })

  it('reports an unsupported (newer) schema as corrupt instead of overwriting it', async () => {
    const p = createNewProject()
    await save(p)
    await repos.db.projects.update(p.id, { config: { schemaVersion: 42 } })
    await expect(repos.projects.get(p.id)).rejects.toBeInstanceOf(StorageError)
  })

  it('maps quota errors to a quota StorageError', async () => {
    const p = createNewProject()
    const original = repos.db.projects.put.bind(repos.db.projects)
    repos.db.projects.put = (() => {
      throw new DOMException('full', 'QuotaExceededError')
    }) as typeof original
    await expect(save(p)).rejects.toMatchObject({ kind: 'quota' })
    // Nothing partially written.
    repos.db.projects.put = original
    expect(await repos.projects.get(p.id)).toBeNull()
  })
})
