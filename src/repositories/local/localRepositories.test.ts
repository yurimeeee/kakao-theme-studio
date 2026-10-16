import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
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

describe('cloud-linked local copies', () => {
  const record = (projectId: string, id: string, bytes: number[]) => ({
    id,
    projectId,
    blob: new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
    mime: 'image/png' as const,
    width: 1,
    height: 1,
    size: bytes.length,
    hash: id.padEnd(64, '0'),
    name: `${id}.png`,
    createdAt: 1,
    lastAttachedAt: 1,
  })

  it('upgrades v1 rows: cloud link fields default to null', async () => {
    const legacy = new Dexie(`legacy-${++dbCount}`)
    legacy.version(1).stores({ projects: 'id, updatedAt', assets: 'id, projectId, [projectId+hash]', thumbnails: 'projectId', meta: 'key' })
    const p = createNewProject()
    const { cloudOwnerId: _o, cloudRevisionId: _r, ...v1Row } = p
    await legacy.table('projects').put({ ...v1Row, revision: 1 })
    legacy.close()

    const upgraded = createLocalRepositories(legacy.name)
    const loaded = await upgraded.projects.get(p.id)
    expect(loaded).toMatchObject({ cloudThemeId: null, cloudOwnerId: null, cloudRevisionId: null })
    expect((await upgraded.projects.list())[0]).toMatchObject({ cloudThemeId: null, cloudOwnerId: null })
    await upgraded.db.delete()
  })

  it('replaceFromCloud swaps the row and all assets atomically and is found by cloud id', async () => {
    const p = createNewProject()
    await repos.assets.put(record(p.id, 'ast_old', [1]))
    await save({ ...p, config: { ...p.config, profile: { mode: 'image', imageAssetId: 'ast_old' } } })

    const fromCloud: ThemeProject = {
      ...p,
      name: '클라우드 버전',
      cloudThemeId: 'theme1',
      cloudOwnerId: 'uid-a',
      cloudRevisionId: 'r2',
      config: { ...p.config, profile: { mode: 'image', imageAssetId: 'ast_new' } },
    }
    const saved = await repos.projects.replaceFromCloud(fromCloud, [record(p.id, 'ast_new', [2])], null)
    expect(saved.revision).toBe(2)
    expect(await repos.assets.get('ast_old')).toBeNull()
    expect(await repos.assets.get('ast_new')).not.toBeNull()
    expect((await repos.projects.findByCloudThemeId('theme1'))?.name).toBe('클라우드 버전')
    expect(await repos.projects.findByCloudThemeId('nope')).toBeNull()
    // A stale autosave of the replaced copy is rejected rather than overwriting the cloud version.
    await expect(save({ ...p, revision: 1 })).rejects.toMatchObject({ kind: 'conflict' })
  })

  it('refuses assets that belong to another project', async () => {
    const p = createNewProject()
    await expect(repos.projects.replaceFromCloud(p, [record('lp_other', 'ast_x', [1])], null)).rejects.toBeInstanceOf(StorageError)
    expect(await repos.projects.get(p.id)).toBeNull()
  })

  it('deleteByCloudOwner removes only that account’s copies and their assets', async () => {
    const mine = { ...createNewProject(), cloudThemeId: 't1', cloudOwnerId: 'uid-a', cloudRevisionId: 'r1' }
    const theirs = { ...createNewProject(), cloudThemeId: 't2', cloudOwnerId: 'uid-b', cloudRevisionId: 'r1' }
    const local = createNewProject()
    for (const p of [mine, theirs, local]) {
      const id = `ast_${p.id.slice(3)}`
      await repos.assets.put(record(p.id, id, [3]))
      await save({ ...p, config: { ...p.config, profile: { mode: 'image', imageAssetId: id } } })
    }
    expect(await repos.projects.deleteByCloudOwner('uid-a')).toBe(1)
    const left = (await repos.projects.list()).map((p) => p.id).sort()
    expect(left).toEqual([theirs.id, local.id].sort())
    expect(await repos.assets.listMeta(mine.id)).toEqual([])
    expect(await repos.assets.listMeta(theirs.id)).toHaveLength(1)
  })

  it('unlinkCloudOwner keeps that account’s copies as local-only projects with their assets', async () => {
    const mine = { ...createNewProject(), cloudThemeId: 't1', cloudOwnerId: 'uid-a', cloudRevisionId: 'r1' }
    const theirs = { ...createNewProject(), cloudThemeId: 't2', cloudOwnerId: 'uid-b', cloudRevisionId: 'r1' }
    await repos.assets.put(record(mine.id, 'ast_m', [3]))
    const saved = await save({ ...mine, config: { ...mine.config, profile: { mode: 'image', imageAssetId: 'ast_m' } } })
    await save(theirs)
    expect(await repos.projects.unlinkCloudOwner('uid-a')).toBe(1)
    const after = await repos.projects.get(mine.id)
    expect(after).toMatchObject({ cloudThemeId: null, cloudOwnerId: null, cloudRevisionId: null, revision: saved.revision + 1 })
    expect(await repos.assets.listMeta(mine.id)).toHaveLength(1)
    expect((await repos.projects.get(theirs.id))?.cloudOwnerId).toBe('uid-b')
    // The stale in-memory copy can no longer overwrite the unlinked row.
    await expect(repos.projects.save(saved, { snapshotAt: Date.now() })).rejects.toMatchObject({ kind: 'conflict' })
  })
})
