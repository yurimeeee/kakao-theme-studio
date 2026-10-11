import { deflateSync } from 'node:zlib'
import { expect, type Page } from '@playwright/test'

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/** Real, decodable RGBA PNG of a solid color. */
export function solidPng(width: number, height: number, rgba: [number, number, number, number]): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const row = Buffer.alloc(1 + width * 4)
  for (let x = 0; x < width; x++) row.set(rgba, 1 + x * 4)
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export function pngSize(buf: Uint8Array): { width: number; height: number } {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/** Start from a clean browser database. */
export async function freshApp(page: Page, hash = '#/editor/new') {
  await page.goto('/')
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('kakao-theme-studio')
        req.onsuccess = req.onerror = req.onblocked = () => resolve()
      }),
  )
  await page.goto(`/${hash}`)
  await page.reload()
  await expect(page.getByTestId('theme-preview')).toBeVisible()
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 })
}

export async function saveWithName(page: Page, name: string) {
  await page.getByRole('button', { name: '저장', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '테마 저장' })
  await dialog.getByLabel('테마 이름').fill(name)
  await dialog.getByRole('button', { name: '저장', exact: true }).click()
  await expect(dialog).toBeHidden()
  await waitSaved(page)
}

/** Counts rows of an IndexedDB store, optionally filtered by projectId. */
export async function countRows(page: Page, store: 'projects' | 'assets', projectId?: string) {
  return page.evaluate(
    ({ store, projectId }) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('kakao-theme-studio')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction(store, 'readonly')
          const req = tx.objectStore(store).getAll()
          req.onsuccess = () => {
            const rows = req.result as { projectId?: string }[]
            resolve(projectId ? rows.filter((r) => r.projectId === projectId).length : rows.length)
            open.result.close()
          }
        }
      }),
    { store, projectId },
  )
}

export const currentProjectId = (page: Page) => page.evaluate(() => location.hash.replace('#/editor/', ''))
