import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getBytes, getMetadata, ref, uploadBytes } from 'firebase/storage'
import { describe, expect, it } from 'vitest'
import type { ThemeProject } from '@/domain/theme/types'
import { adminDocExists, anonymousClient, eventually, projectWithImages, signedInClient, uniqueTag } from '@/test/cloudEmulator'
import { CloudThemeRepository, type CloudSaveResult } from './cloudThemes'
import { ShareRepository } from './shares'

const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })

const linked = (project: ThemeProject, r: CloudSaveResult): ThemeProject => ({
  ...project,
  cloudThemeId: r.themeId,
  cloudOwnerId: r.ownerId,
  cloudRevisionId: r.revisionId,
})

async function ownerWithTheme(name = '구름 테마') {
  const owner = await signedInClient('유림')
  const themes = new CloudThemeRepository(owner)
  const shares = new ShareRepository(owner)
  const { project, assets } = projectWithImages(name)
  const saved = await themes.save({ project, assets, thumbnail: png })
  return { owner, themes, shares, project, assets, saved }
}

const denied = expect.objectContaining({ code: expect.stringMatching(/permission-denied|unauthorized|unauthenticated/) })

describe('ShareRepository (emulator)', () => {
  it('비공개: no share exists and nobody else can read anything', async () => {
    const { saved } = await ownerWithTheme()
    const anon = anonymousClient()
    await expect(getDoc(doc(anon.db, 'themes', saved.themeId))).rejects.toEqual(denied)
  })

  it('공개: anyone can read and download the published copy without signing in; inactive originals stay private', async () => {
    const { shares, saved } = await ownerWithTheme()
    const { shareId } = await shares.setVisibility(saved.themeId, 'public')
    expect(shareId).toMatch(/^[A-Za-z0-9]{22}$/)

    const anon = new ShareRepository(anonymousClient())
    const shared = await anon.get(shareId!)
    expect(shared).toMatchObject({ name: '구름 테마', ownerName: '유림', visibility: 'public', downloadCount: 0 })
    // Only the active background is published; the inactive profile original is not.
    expect(Object.keys(shared!.assetManifest)).toEqual(['ast_bg1'])
    expect(shared!.config.profile.imageAssetId).toBeNull()
    expect(shared!.assetManifest.ast_bg1.path.startsWith(`shares/${shareId}/`)).toBe(true)
    const blobs = await anon.downloadAssets(shared!)
    expect(blobs.get('ast_bg1')!.size).toBeGreaterThan(0)
    expect((await anon.downloadThumbnail(shared!.thumbnailPath!)).size).toBe(png.size)
    // Owner-private files are still private.
    const theme = await new CloudThemeRepository(await signedInClient()).get(saved.themeId)
    expect(theme).toBeNull()
  })

  it('링크 공개: readable by link, never listed in the gallery', async () => {
    const tag = uniqueTag()
    const { shares, saved } = await ownerWithTheme(`링크 ${tag}`)
    const { shareId } = await shares.setVisibility(saved.themeId, 'unlisted')
    const anon = new ShareRepository(anonymousClient())
    expect(await anon.get(shareId!)).toMatchObject({ visibility: 'unlisted' })
    const page = await anon.gallery({ sort: 'latest', search: tag })
    expect(page.items).toEqual([])
  })

  it('비공개 전환 blocks the old link and its files immediately', async () => {
    const { shares, saved } = await ownerWithTheme()
    const { shareId } = await shares.setVisibility(saved.themeId, 'public')
    const anonClient = anonymousClient()
    const anon = new ShareRepository(anonClient)
    const path = (await anon.get(shareId!))!.assetManifest.ast_bg1.path

    await shares.setVisibility(saved.themeId, 'private')
    expect(await anon.get(shareId!)).toBeNull()
    await expect(getBytes(ref(anonClient.storage, path))).rejects.toEqual(denied)
    // And the server removes the copies.
    await eventually(async () => {
      try {
        await getBytes(ref((await signedInClient()).storage, path))
        return false
      } catch {
        return true
      }
    })
  })

  it('링크 변경 issues a new link and the old one stops working', async () => {
    const { shares, saved } = await ownerWithTheme()
    const first = (await shares.setVisibility(saved.themeId, 'unlisted')).shareId!
    const anonClient = anonymousClient()
    const anon = new ShareRepository(anonClient)
    const oldPath = (await anon.get(first))!.assetManifest.ast_bg1.path

    const second = (await shares.setVisibility(saved.themeId, 'unlisted', { rotateLink: true })).shareId!
    expect(second).not.toBe(first)
    expect(await anon.get(first)).toBeNull()
    await expect(getBytes(ref(anonClient.storage, oldPath))).rejects.toEqual(denied)
    expect(await anon.get(second)).not.toBeNull()
  })

  it('deleting a shared theme removes its share too', async () => {
    const { themes, shares, saved } = await ownerWithTheme()
    const { shareId } = await shares.setVisibility(saved.themeId, 'public')
    await themes.delete(saved.themeId)
    expect(await new ShareRepository(anonymousClient()).get(shareId!)).toBeNull()
    expect(await adminDocExists(`shares/${shareId}`)).toBe(false)
  })

  it('saving a shared theme updates what the link shows', async () => {
    const { themes, shares, project, assets, saved } = await ownerWithTheme()
    const { shareId } = await shares.setVisibility(saved.themeId, 'public')
    const next = linked(project, saved)
    next.name = '바뀐 이름'
    next.config.palette.accent = '#abcdef'
    await themes.save({ project: next, assets, thumbnail: png })
    await shares.syncPublished(saved.themeId)
    const shared = await new ShareRepository(anonymousClient()).get(shareId!)
    expect(shared).toMatchObject({ name: '바뀐 이름' })
    expect(shared!.config.palette.accent).toBe('#abcdef')
  })

  it('re-publishing keeps unchanged published files and uses the local thumbnail', async () => {
    const { owner, themes, shares, project, assets, saved } = await ownerWithTheme()
    const { shareId } = await shares.setVisibility(saved.themeId, 'public')
    const before = (await new ShareRepository(anonymousClient()).get(shareId!))!
    const assetPath = Object.values(before.assetManifest)[0].path
    const generation = (await getMetadata(ref(owner.storage, assetPath))).generation

    const next = linked(project, saved)
    next.config.palette.accent = '#abcdef'
    const thumb = new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: 'image/png' })
    const r2 = await themes.save({ project: next, assets, thumbnail: thumb })
    await shares.syncPublished(saved.themeId, { localThumbnail: { revisionId: r2.revisionId, blob: thumb } })

    const after = (await new ShareRepository(anonymousClient()).get(shareId!))!
    expect(after.config.palette.accent).toBe('#abcdef')
    expect(Object.values(after.assetManifest)[0].path).toBe(assetPath)
    expect((await getMetadata(ref(owner.storage, assetPath))).generation).toBe(generation)
    expect(after.thumbnailPath).not.toBe(before.thumbnailPath)
    expect((await getBytes(ref(owner.storage, after.thumbnailPath!))).byteLength).toBe(thumb.size)
  })

  it('only the owner can change a share; nobody can forge download counts', async () => {
    const { owner, shares, saved } = await ownerWithTheme()
    const { shareId } = await shares.setVisibility(saved.themeId, 'public')
    const other = await signedInClient()
    const anon = anonymousClient()
    const shareRef = (c: { db: typeof owner.db }) => doc(c.db, 'shares', shareId!)

    await expect(updateDoc(shareRef(anon), { name: '탈취' })).rejects.toEqual(denied)
    await expect(updateDoc(shareRef(other), { name: '탈취' })).rejects.toEqual(denied)
    await expect(updateDoc(shareRef(owner), { downloadCount: 9999 })).rejects.toEqual(denied)
    await expect(uploadBytes(ref(other.storage, `shares/${shareId}/assets/evil.png`), png, { contentType: 'image/png' })).rejects.toEqual(denied)
    // Cannot publish someone else's theme under a new share id either.
    const data = (await getDoc(shareRef(owner))).data()!
    await expect(setDoc(doc(other.db, 'shares', 'X'.repeat(22)), { ...data, ownerId: other.uid, downloadCount: 0 })).rejects.toEqual(denied)
  })

  it('gallery: public only, substring search, consistent pagination and sort orders', async () => {
    const tag = uniqueTag()
    const owner = await signedInClient('갤러리')
    const themes = new CloudThemeRepository(owner)
    const shares = new ShareRepository(owner)
    const names = [`봄날 ${tag} 하나`, `봄날 ${tag} 둘`, `여름 ${tag} 셋`, `봄날 ${tag} 비공개`]
    const shareIds: string[] = []
    for (const [i, name] of names.entries()) {
      const { project, assets } = projectWithImages(name)
      const r = await themes.save({ project, assets, thumbnail: null })
      if (i < 3) shareIds.push((await shares.setVisibility(r.themeId, 'public')).shareId!)
    }

    const anon = new ShareRepository(anonymousClient())
    const page1 = await anon.gallery({ sort: 'latest', search: tag, pageSize: 2 })
    expect(page1.items.map((i) => i.name)).toEqual([names[2], names[1]])
    expect(page1.next).not.toBeNull()
    const page2 = await anon.gallery({ sort: 'latest', search: tag, after: page1.next, pageSize: 2 })
    expect(page2.items.map((i) => i.name)).toEqual([names[0]])
    expect(page2.next).toBeNull()

    // Korean substring + case/space normalization.
    const spring = await anon.gallery({ sort: 'latest', search: `  봄날 ${tag.toUpperCase()} ` })
    expect(spring.items.map((i) => i.name).sort()).toEqual([names[0], names[1]].sort())
    expect((await anon.gallery({ sort: 'latest', search: `${tag} 없음` })).items).toEqual([])

    // 인기순: two different accounts download "하나", one downloads "셋"; repeats and the owner do not count.
    const a = await signedInClient()
    const b = await signedInClient()
    const record = (c: typeof a, id: string) => httpsCallable<{ shareId: string }, { counted: boolean }>(c.functions, 'recordDownload')({ shareId: id })
    expect((await record(a, shareIds[0])).data.counted).toBe(true)
    expect((await record(a, shareIds[0])).data.counted).toBe(false)
    expect((await record(b, shareIds[0])).data.counted).toBe(true)
    expect((await record(b, shareIds[2])).data.counted).toBe(true)
    expect((await record({ ...owner }, shareIds[1])).data.counted).toBe(false)
    const popular = await anon.gallery({ sort: 'popular', search: tag })
    expect(popular.items.map((i) => [i.name, i.downloadCount])).toEqual([
      [names[0], 2],
      [names[2], 1],
      [names[1], 0],
    ])
  })

  it('recordDownload rejects unknown or non-public shares', async () => {
    const anon = anonymousClient()
    const call = httpsCallable(anon.functions, 'recordDownload')
    await expect(call({ shareId: 'nope' })).rejects.toMatchObject({ code: 'functions/invalid-argument' })
    await expect(call({ shareId: 'Z'.repeat(22) })).rejects.toMatchObject({ code: 'functions/not-found' })
  })
})
