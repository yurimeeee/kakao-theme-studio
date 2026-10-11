import JSZip from 'jszip'
import { DEFAULT_THEME_NAME } from '@/domain/theme/defaults'
import { buildThemePackage, ExportError, type ExportSnapshot } from './buildPackage'
import { CSS_FILE_NAME, IMAGES_DIR } from './catalog'
import { BrowserRasterizer, type Rasterizer } from './raster'
import { validatePackage } from './validate'

export interface KthemeArchive {
  blob: Blob
  fileName: string
  entries: string[]
}

/** File name for download: keeps Unicode (NFC), strips path/control characters. */
export function toKthemeFileName(name: string): string {
  const cleaned = name
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 60)
  return `${cleaned || DEFAULT_THEME_NAME}.ktheme`
}

/**
 * Builds a validated .ktheme archive entirely in the browser. Never uploads anything.
 * Entry order mirrors the reference: CSS first, then the Images/ directory.
 */
export async function createKthemeArchive(
  snapshot: ExportSnapshot,
  raster: Rasterizer = new BrowserRasterizer(),
): Promise<KthemeArchive> {
  const pkg = await buildThemePackage(snapshot, raster)
  const issues = await validatePackage(pkg.files)
  if (issues.length) {
    throw new ExportError(
      'invalid-package',
      'Generated package failed validation',
      issues.map((i) => `${i.code}${i.path ? ` ${i.path}` : ''}: ${i.detail}`),
    )
  }

  const zip = new JSZip()
  const ordered = [...pkg.files.keys()].sort((a, b) =>
    a === CSS_FILE_NAME ? -1 : b === CSS_FILE_NAME ? 1 : a.localeCompare(b),
  )
  for (const path of ordered) {
    if (path !== CSS_FILE_NAME && !zip.files[`${IMAGES_DIR}/`]) zip.folder(IMAGES_DIR)
    // Pass bytes, not Blob: JSZip reads Blobs via FileReader, which is not available everywhere.
    zip.file(path, new Uint8Array(await pkg.files.get(path)!.arrayBuffer()), { binary: true })
  }
  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  return {
    blob: new Blob([bytes as BlobPart], { type: 'application/octet-stream' }),
    fileName: toKthemeFileName(snapshot.name),
    entries: [`${IMAGES_DIR}/`, ...ordered],
  }
}

/** Triggers a browser download. The object URL is revoked after a delay (iOS Safari needs time). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export { ExportError }
