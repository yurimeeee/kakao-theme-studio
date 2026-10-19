import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { getRepositories } from '@/app/services'
import { importImage } from '@/assets/importImage'
import { createNewProject } from '@/domain/theme/defaults'
import { mapAssetRefs } from '@/domain/theme/normalize'
import type { ThemeProject } from '@/domain/theme/types'
import { KthemeImportError } from '@/importers/ktheme/readArchive'
import { fakePng } from '@/test/fakeRasterizer'
import { BackupError, createProjectBackup } from './backup'
import { importFailureMessage, importThemeFile } from './importFile'

// Saving a backup first flushes the editor's autosave timers.
vi.stubGlobal('window', globalThis)

/** Reads the size from the PNG header, like the browser decoder would. */
const decode = async (blob: Blob) => {
  const view = new DataView(await blob.arrayBuffer())
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/** A stored project with an active chat background (cropped), and a bubble image kept while in color mode. */
async function storedProject(name: string): Promise<ThemeProject> {
  const { projects, assets } = getRepositories()
  const p = createNewProject()
  const bg = await importImage(p.id, fakePng(640, 960), assets, decode)
  const bubble = await importImage(p.id, fakePng(90, 60), assets, decode)
  p.name = name
  p.config.background.chatroom = { mode: 'image', color: '#ffffff', imageAssetId: bg.id, focus: { x: 0.2, y: 0.7, zoom: 1.8 } }
  p.config.bubbles.send = { ...p.config.bubbles.send, mode: 'color', color: '#123456', imageAssetId: bubble.id }
  return projects.save(p, { snapshotAt: Date.now() + 1 })
}

async function rewrite(blob: Blob, edit: (manifest: Record<string, unknown>, zip: JSZip) => void): Promise<Blob> {
  const zip = await JSZip.loadAsync(new Uint8Array(await blob.arrayBuffer()))
  const manifest = JSON.parse(await zip.file('project.json')!.async('string'))
  edit(manifest, zip)
  zip.file('project.json', JSON.stringify(manifest))
  return new Blob([(await zip.generateAsync({ type: 'uint8array' })) as BlobPart])
}

describe('project backup', () => {
  it('restores the exact project, every image included, in place of a deleted original', async () => {
    const original = await storedProject('백업 테마')
    const { blob, fileName } = await createProjectBackup(original.id)
    expect(fileName).toBe('백업 테마.ktproject')
    const { projects, assets } = getRepositories()
    const originalAssets = await assets.listMeta(original.id)
    await projects.delete(original.id)

    const result = await importThemeFile(blob, { decode })
    expect(result).toMatchObject({ kind: 'backup', name: '백업 테마', notes: [] })
    const restored = (await projects.get(result.projectId))!
    expect(restored.id).not.toBe(original.id)
    // Same .ktheme id: re-exporting updates the theme already installed on the phone.
    expect(restored.exportThemeId).toBe(original.exportThemeId)
    expect(restored.createdAt).toBe(original.createdAt)

    const restoredAssets = await assets.listMeta(restored.id)
    expect(restoredAssets).toHaveLength(2)
    const byHash = new Map(originalAssets.map((a) => [a.hash, a.id]))
    for (const a of restoredAssets) expect(byHash.has(a.hash)).toBe(true)
    // Fresh asset ids, pointing at the same pictures.
    const newToOld = new Map(restoredAssets.map((a) => [a.id, byHash.get(a.hash)!]))
    expect(mapAssetRefs(restored.config, (id) => newToOld.get(id) ?? null)).toEqual(original.config)
  })

  it('becomes a copy with its own .ktheme id while the original is still here', async () => {
    const original = await storedProject('둘')
    const { blob } = await createProjectBackup(original.id)
    const result = await importThemeFile(blob, { decode })
    const restored = (await getRepositories().projects.get(result.projectId))!
    expect(restored.exportThemeId).not.toBe(original.exportThemeId)
    expect(result.notes).toEqual([expect.stringContaining('사본으로')])
  })

  it('reports images it cannot read and clears their references', async () => {
    const original = await storedProject('빠진 이미지')
    const { blob } = await createProjectBackup(original.id)
    await getRepositories().projects.delete(original.id)
    const broken = await rewrite(blob, (m, zip) => {
      const [first] = m.assets as { path: string }[]
      zip.remove(first.path)
    })
    const result = await importThemeFile(broken, { decode })
    expect(result.notes).toEqual([expect.stringContaining('이미지 1개')])
    expect(await getRepositories().assets.listMeta(result.projectId)).toHaveLength(1)
  })

  it('refuses backups from a newer version instead of losing data', async () => {
    const original = await storedProject('새 버전')
    const { blob } = await createProjectBackup(original.id)
    const newerFormat = await rewrite(blob, (m) => (m.formatVersion = 2))
    const newerSchema = await rewrite(blob, (m) => ((m.project as { config: { schemaVersion: number } }).config.schemaVersion = 99))
    for (const file of [newerFormat, newerSchema]) {
      const error = await importThemeFile(file, { decode }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(BackupError)
      expect((error as BackupError).code).toBe('newer-version')
    }
    const corrupt = await rewrite(blob, (m) => (m.format = 'something-else'))
    expect(await importThemeFile(corrupt, { decode }).catch((e: unknown) => (e as BackupError).code)).toBe('corrupt')
  })

  it('names both file kinds when the file is neither', async () => {
    const error = await importThemeFile(new Blob(['hello']), { decode }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(KthemeImportError)
    expect(importFailureMessage(error)).toContain('.ktproject')
  })
})
