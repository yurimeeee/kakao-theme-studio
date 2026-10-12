import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { getBytes, getMetadata, listAll, ref, uploadBytes } from 'firebase/storage'
import { describe, expect, it } from 'vitest'
import { CloudError } from '@/cloud/errors'
import { userAssetPath } from '@/cloud/model'
import type { ThemeProject } from '@/domain/theme/types'
import { adminDocExists, anonymousClient, eventually, fakeAsset, projectWithImages, signedInClient } from '@/test/cloudEmulator'
import { CloudThemeRepository, ORPHAN_GRACE_MS, type CloudSaveResult } from './cloudThemes'

const linked = (project: ThemeProject, r: CloudSaveResult): ThemeProject => ({
  ...project,
  cloudThemeId: r.themeId,
  cloudOwnerId: r.ownerId,
  cloudRevisionId: r.revisionId,
})

const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })

describe('CloudThemeRepository (emulator)', () => {
  it('saves config to Firestore and originals to Storage under the owner, keyed by hash', async () => {
    const owner = await signedInClient()
    const repo = new CloudThemeRepository(owner)
    const { project, assets } = projectWithImages()
    const r = await repo.save({ project, assets, thumbnail: png })

    const theme = await repo.get(r.themeId)
    expect(theme).toMatchObject({ ownerId: owner.uid, name: '구름 테마', visibility: 'private', shareId: null, activeRevisionId: r.revisionId, previousRevisionId: null })
    expect(theme!.config.background.chatroom.imageAssetId).toBe('ast_bg1')
    // Inactive originals (profile kept while in 기본 mode) are saved too, so other devices keep them.
    expect(Object.keys(theme!.assetManifest).sort()).toEqual(['ast_bg1', 'ast_pf1'])
    const bg = assets.get('ast_bg1')!
    expect(theme!.assetManifest.ast_bg1.path).toBe(userAssetPath(owner.uid, r.themeId, bg.hash, 'png'))
    const bytes = await getBytes(ref(owner.storage, theme!.assetManifest.ast_bg1.path))
    expect(new Uint8Array(bytes)).toEqual(new Uint8Array(await bg.blob.arrayBuffer()))
    // Firestore holds metadata only — no image bytes.
    expect(JSON.stringify(theme!.assetManifest)).not.toContain('PNG-')

    const rev = await getDoc(doc(owner.db, 'themes', r.themeId, 'revisions', r.revisionId))
    expect(rev.data()).toMatchObject({ ownerId: owner.uid, baseRevisionId: null })
    const downloaded = await repo.downloadAssets(theme!)
    expect(downloaded.get('ast_pf1')!.size).toBe(assets.get('ast_pf1')!.size)
  })

  it('promotes a new revision, keeps the previous one and does not re-upload unchanged images', async () => {
    const owner = await signedInClient()
    const repo = new CloudThemeRepository(owner)
    const { project, assets } = projectWithImages()
    const r1 = await repo.save({ project, assets, thumbnail: png })
    const bgPath = (await repo.get(r1.themeId))!.assetManifest.ast_bg1.path
    const before = await getMetadata(ref(owner.storage, bgPath))

    const p2 = linked(project, r1)
    p2.config.palette.accent = '#123456'
    const r2 = await repo.save({ project: p2, assets, thumbnail: png })
    expect(r2.themeId).toBe(r1.themeId)
    const theme = await repo.get(r1.themeId)
    expect(theme).toMatchObject({ activeRevisionId: r2.revisionId, previousRevisionId: r1.revisionId })
    expect(theme!.config.palette.accent).toBe('#123456')
    const after = await getMetadata(ref(owner.storage, bgPath))
    expect(after.generation).toBe(before.generation)
  })

  it('detects a concurrent save from the same base and never overwrites it', async () => {
    const owner = await signedInClient()
    const repo = new CloudThemeRepository(owner)
    const { project, assets } = projectWithImages()
    const r1 = await repo.save({ project, assets, thumbnail: null })
    const base = linked(project, r1)

    const deviceA = structuredClone(base)
    deviceA.name = 'A에서 저장'
    const deviceB = structuredClone(base)
    deviceB.name = 'B에서 저장'
    const rA = await repo.save({ project: deviceA, assets, thumbnail: null })
    await expect(repo.save({ project: deviceB, assets, thumbnail: null })).rejects.toMatchObject({ kind: 'conflict' })

    const theme = await repo.get(r1.themeId)
    expect(theme).toMatchObject({ name: 'A에서 저장', activeRevisionId: rA.revisionId })
  })

  it('a failed save leaves the previous revision active and intact', async () => {
    const owner = await signedInClient()
    const repo = new CloudThemeRepository(owner)
    const { project, assets } = projectWithImages()
    const r1 = await repo.save({ project, assets, thumbnail: null })

    const broken = linked(project, r1)
    broken.name = '깨진 저장'
    broken.config.bubbles.send = { ...broken.config.bubbles.send, mode: 'image', imageAssetId: 'ast_missing' }
    await expect(repo.save({ project: broken, assets, thumbnail: null })).rejects.toMatchObject({ kind: 'missing-asset' })

    const theme = await repo.get(r1.themeId)
    expect(theme).toMatchObject({ name: '구름 테마', activeRevisionId: r1.revisionId })
    expect((await repo.downloadAssets(theme!)).size).toBe(2)
  })

  it('refuses to save a copy linked to another account, or a theme deleted elsewhere', async () => {
    const owner = await signedInClient()
    const repo = new CloudThemeRepository(owner)
    const { project, assets } = projectWithImages()
    await expect(repo.save({ project: { ...project, cloudOwnerId: 'someone-else' }, assets, thumbnail: null })).rejects.toMatchObject({ kind: 'other-account' })

    const r1 = await repo.save({ project, assets, thumbnail: null })
    await repo.delete(r1.themeId)
    await expect(repo.save({ project: linked(project, r1), assets, thumbnail: null })).rejects.toMatchObject({ kind: 'gone' })
  })

  it('requires sign-in', async () => {
    const repo = new CloudThemeRepository(anonymousClient())
    const { project, assets } = projectWithImages()
    await expect(repo.save({ project, assets, thumbnail: null })).rejects.toBeInstanceOf(CloudError)
  })

  it('other accounts and anonymous users cannot read, change or delete a theme or its files', async () => {
    const owner = await signedInClient()
    const other = await signedInClient()
    const anon = anonymousClient()
    const repo = new CloudThemeRepository(owner)
    const { project, assets } = projectWithImages()
    const r = await repo.save({ project, assets, thumbnail: png })
    const path = (await repo.get(r.themeId))!.assetManifest.ast_bg1.path

    for (const c of [other, anon]) {
      await expect(getDoc(doc(c.db, 'themes', r.themeId))).rejects.toMatchObject({ code: 'permission-denied' })
      await expect(getBytes(ref(c.storage, path))).rejects.toMatchObject({ code: expect.stringMatching(/unauthorized|unauthenticated/) })
    }
    expect(await new CloudThemeRepository(other).get(r.themeId)).toBeNull()
    await expect(updateDoc(doc(other.db, 'themes', r.themeId), { name: '탈취' })).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(deleteDoc(doc(other.db, 'themes', r.themeId))).rejects.toMatchObject({ code: 'permission-denied' })
    // Cannot plant a theme in someone else's name either.
    await expect(
      setDoc(doc(other.db, 'themes', 'planted'), { ...(await getDoc(doc(owner.db, 'themes', r.themeId))).data(), ownerId: owner.uid }),
    ).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(uploadBytes(ref(other.storage, path), png, { contentType: 'image/png' })).rejects.toMatchObject({ code: 'storage/unauthorized' })
    // Owner still sees the original.
    expect((await repo.get(r.themeId))!.name).toBe('구름 테마')
  })

  it('cleanup removes orphans and old revisions but keeps the active and previous revision files', async () => {
    const owner = await signedInClient()
    const repo = new CloudThemeRepository(owner)
    const { project, assets } = projectWithImages()
    const r1 = await repo.save({ project, assets, thumbnail: png })

    // r2 replaces the background, r3 replaces it again → r1's background is unreferenced.
    const p2 = linked(project, r1)
    const bg2 = fakeAsset('ast_bg2', 'bg-second', project.id)
    p2.config.background.chatroom.imageAssetId = bg2.id
    const assets2 = new Map(assets).set(bg2.id, bg2)
    const r2 = await repo.save({ project: p2, assets: assets2, thumbnail: png })
    const p3 = linked(p2, r2)
    const bg3 = fakeAsset('ast_bg3', 'bg-third', project.id)
    p3.config.background.chatroom.imageAssetId = bg3.id
    const assets3 = new Map(assets2).set(bg3.id, bg3)
    const r3 = await repo.save({ project: p3, assets: assets3, thumbnail: png })

    // An orphan from a failed upload attempt.
    const orphan = userAssetPath(owner.uid, r1.themeId, 'f'.repeat(64), 'png')
    await uploadBytes(ref(owner.storage, orphan), png, { contentType: 'image/png' })

    // Inside the grace period nothing young is removed.
    await repo.cleanup(r1.themeId)
    await expect(getMetadata(ref(owner.storage, orphan))).resolves.toBeTruthy()

    const result = await repo.cleanup(r1.themeId, Date.now() + ORPHAN_GRACE_MS + 1000)
    expect(result.deletedRevisions).toBe(0) // r1 revision doc was already removed by r3's own cleanup
    const remaining = (await listAll(ref(owner.storage, `users/${owner.uid}/themes/${r1.themeId}/assets`))).items.map((i) => i.fullPath)
    const theme = await repo.get(r1.themeId)
    expect(theme).toMatchObject({ activeRevisionId: r3.revisionId, previousRevisionId: r2.revisionId })
    expect(remaining.sort()).toEqual(
      [assets.get('ast_pf1')!, bg2, bg3].map((a) => userAssetPath(owner.uid, r1.themeId, a.hash, 'png')).sort(),
    )
    const revisions = await Promise.all([r1, r2, r3].map((r) => getDoc(doc(owner.db, 'themes', r1.themeId, 'revisions', r.revisionId))))
    expect(revisions.map((d) => d.exists())).toEqual([false, true, true])
  })

  it('deleting a theme blocks access at once and the server removes its files', async () => {
    const owner = await signedInClient()
    const repo = new CloudThemeRepository(owner)
    const { project, assets } = projectWithImages()
    const r = await repo.save({ project, assets, thumbnail: png })
    await repo.delete(r.themeId)
    expect(await repo.get(r.themeId)).toBeNull()
    expect(await repo.list()).toEqual([])
    await eventually(async () => (await listAll(ref(owner.storage, `users/${owner.uid}/themes/${r.themeId}/assets`))).items.length === 0)
    await eventually(async () => !(await adminDocExists(`themes/${r.themeId}/revisions/${r.revisionId}`)))
  })

  it('lists only the signed-in account’s themes, newest first', async () => {
    const a = await signedInClient()
    const b = await signedInClient()
    const repoA = new CloudThemeRepository(a)
    const first = projectWithImages('첫 번째')
    const second = projectWithImages('두 번째')
    await repoA.save({ ...first, thumbnail: null })
    await repoA.save({ ...second, thumbnail: null })
    await new CloudThemeRepository(b).save({ ...projectWithImages('남의 테마'), thumbnail: null })
    expect((await repoA.list()).map((t) => t.name)).toEqual(['두 번째', '첫 번째'])
  })
})
