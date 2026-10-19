import JSZip from 'jszip'
import { DEFAULT_THEME_NAME } from '@/domain/theme/defaults'
import { downloadBlob, toSafeFileName } from '@/lib/download'
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
  return toSafeFileName(name, '.ktheme', DEFAULT_THEME_NAME)
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

export { downloadBlob, ExportError }
