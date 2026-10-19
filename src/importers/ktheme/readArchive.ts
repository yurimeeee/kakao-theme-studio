import JSZip from 'jszip'
import { CSS_FILE_NAME, IMAGES_DIR, THEME_ICON_FILE } from '@/exporters/ktheme/catalog'

export const IMPORT_LIMITS = {
  maxArchiveBytes: 50 * 1024 * 1024,
  maxEntries: 1000,
  /** Per extracted image; matches the editor's upload limit. */
  maxImageBytes: 10 * 1024 * 1024,
}

export type KthemeImportErrorCode = 'too-large' | 'not-archive' | 'missing-css' | 'too-many-entries'

export class KthemeImportError extends Error {
  readonly code: KthemeImportErrorCode

  constructor(code: KthemeImportErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'KthemeImportError'
  }
}

export function importErrorMessage(e: unknown): string {
  if (!(e instanceof KthemeImportError)) return '테마 파일을 가져오지 못했어요.'
  switch (e.code) {
    case 'too-large':
      return `파일이 너무 커요. ${IMPORT_LIMITS.maxArchiveBytes / 1024 / 1024}MB 이하의 테마 파일을 선택해 주세요.`
    case 'not-archive':
      return '.ktheme 파일이 아니에요. 카카오톡 iOS 테마 파일을 선택해 주세요.'
    case 'missing-css':
      return `테마 설정 파일(${CSS_FILE_NAME})이 없는 테마예요.`
    case 'too-many-entries':
      return '파일이 너무 많이 들어 있는 테마예요.'
  }
}

/** A scaled variant of one image (`name@3x.png` → scale 3; no suffix → 1). */
export interface ArchiveImage {
  blob: Blob
  scale: number
}

export interface ThemeArchive {
  css: string
  /** Best variant of `'base.png'` as CSS references it: @3x, then @2x, then unsuffixed. */
  image(base: string): Promise<ArchiveImage | null>
  themeIcon(): Promise<Blob | null>
}

const IMAGE_NAME = /^(.+?)(?:@([23])x)?\.png$/i
const SCALE_ORDER = [3, 2, 1]

/** Parses a ZIP container (.ktheme or project backup); the caller checks the size limit for its kind first. */
export async function openZip(file: Blob): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw new KthemeImportError('not-archive', 'Not a ZIP archive')
  }
}

/** File entries without Finder leftovers (`__MACOSX/`, `.DS_Store`, `._*`); throws past the entry limit. */
export function zipEntries(zip: JSZip): JSZip.JSZipObject[] {
  const entries = Object.values(zip.files).filter((e) => {
    if (e.dir || e.name.includes('__MACOSX/')) return false
    const leaf = e.name.split('/').pop() ?? ''
    return leaf !== '.DS_Store' && !leaf.startsWith('._')
  })
  if (entries.length > IMPORT_LIMITS.maxEntries) throw new KthemeImportError('too-many-entries', `${entries.length} entries`)
  return entries
}

/** JSZip keeps the declared size internally; reading it lets oversized (zip bomb) entries be skipped before inflating. */
export const declaredSize = (entry: JSZip.JSZipObject) =>
  (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0

/**
 * Opens a .ktheme (plain ZIP). Tolerates Finder leftovers (`__MACOSX/`, `.DS_Store`) and a
 * wrapping folder; images are read lazily so only the ones the CSS uses are inflated.
 */
export async function readKthemeArchive(file: Blob | JSZip): Promise<ThemeArchive> {
  if (file instanceof Blob && file.size > IMPORT_LIMITS.maxArchiveBytes) throw new KthemeImportError('too-large', 'Archive too large')
  const zip = file instanceof Blob ? await openZip(file) : file
  const entries = zipEntries(zip)

  const cssEntry = entries
    .filter((e) => (e.name.split('/').pop() ?? '').toLowerCase() === CSS_FILE_NAME.toLowerCase())
    .sort((a, b) => a.name.length - b.name.length)[0]
  if (!cssEntry) throw new KthemeImportError('missing-css', 'KakaoTalkTheme.css not found')
  const root = cssEntry.name.slice(0, cssEntry.name.length - CSS_FILE_NAME.length)
  // TextDecoder drops the UTF-8 BOM the reference files carry.
  const css = new TextDecoder('utf-8').decode(await cssEntry.async('uint8array'))

  // base name → scale → entry. Exact names first; case-insensitive as a fallback (iOS file names are not case-sensitive).
  const imagesPrefix = `${root}${IMAGES_DIR}/`.toLowerCase()
  const byBase = new Map<string, Map<number, JSZip.JSZipObject>>()
  for (const e of entries) {
    if (!e.name.toLowerCase().startsWith(imagesPrefix)) continue
    const m = IMAGE_NAME.exec(e.name.slice(imagesPrefix.length))
    if (!m || m[1].includes('/')) continue
    const scales = byBase.get(m[1]) ?? new Map()
    scales.set(m[2] ? Number(m[2]) : 1, e)
    byBase.set(m[1], scales)
  }
  const lowerBase = new Map([...byBase.keys()].map((k) => [k.toLowerCase(), k]))

  const read = async (entry: JSZip.JSZipObject): Promise<Blob | null> => {
    if (declaredSize(entry) > IMPORT_LIMITS.maxImageBytes) return null
    const bytes = await entry.async('uint8array')
    if (bytes.length > IMPORT_LIMITS.maxImageBytes) return null
    return new Blob([bytes as BlobPart], { type: 'image/png' })
  }

  return {
    css,
    async image(base) {
      const scales = byBase.get(base) ?? byBase.get(lowerBase.get(base.toLowerCase()) ?? '')
      if (!scales) return null
      for (const scale of SCALE_ORDER) {
        const entry = scales.get(scale)
        const blob = entry && (await read(entry))
        if (blob) return { blob, scale }
      }
      return null
    },
    async themeIcon() {
      const entry = byBase.get(THEME_ICON_FILE.replace(/\.png$/, ''))?.get(1)
      return entry ? read(entry) : null
    },
  }
}
