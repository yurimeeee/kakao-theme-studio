import { CSS_FILE_NAME, IMAGES_DIR, THEME_ICON_FILE } from './catalog'
import { parseThemeCss, referencedImages } from './css'
import { readPngSize } from './raster'

export interface PackageIssue {
  code:
    | 'missing-css'
    | 'missing-manifest-field'
    | 'missing-image'
    | 'orphan-image'
    | 'unsafe-path'
    | 'invalid-png'
    | 'scale-mismatch'
    | 'stretch-out-of-bounds'
  path?: string
  detail: string
}

const SAFE_PATH = /^(KakaoTalkTheme\.css|Images\/[A-Za-z0-9_]+(@[23]x)?\.png)$/
const REQUIRED_MANIFEST = ['-kakaotalk-theme-name', '-kakaotalk-theme-id', '-kakaotalk-theme-version']
const BUBBLE_PROPS = [
  '-ios-background-image',
  '-ios-selected-background-image',
  '-ios-group-background-image',
  '-ios-group-selected-background-image',
]

async function readText(blob: Blob): Promise<string> {
  return new TextDecoder('utf-8').decode(await blob.arrayBuffer())
}

/**
 * Structural integrity check run before every download (and in tests against the
 * real archive). Validates paths, manifest, that every CSS image reference resolves
 * to @2x and @3x files, PNG validity, scale consistency and bubble stretch bounds.
 */
export async function validatePackage(files: ReadonlyMap<string, Blob>): Promise<PackageIssue[]> {
  const issues: PackageIssue[] = []

  for (const path of files.keys()) {
    if (!SAFE_PATH.test(path) || path.includes('__MACOSX') || path.includes('.DS_Store')) {
      issues.push({ code: 'unsafe-path', path, detail: 'Unexpected archive entry' })
    }
  }

  const cssBlob = files.get(CSS_FILE_NAME)
  if (!cssBlob) {
    issues.push({ code: 'missing-css', detail: `${CSS_FILE_NAME} not found` })
    return issues
  }
  const css = await readText(cssBlob)
  const parsed = parseThemeCss(css)
  const manifest = parsed.get('ManifestStyle')
  for (const field of REQUIRED_MANIFEST) {
    const value = manifest?.get(field)?.replace(/^'|'$/g, '')
    if (!value) issues.push({ code: 'missing-manifest-field', detail: field })
  }

  const sizes = new Map<string, { width: number; height: number }>()
  for (const [path, blob] of files) {
    if (!path.endsWith('.png')) continue
    const size = await readPngSize(blob)
    if (!size) issues.push({ code: 'invalid-png', path, detail: 'Not a PNG' })
    else sizes.set(path, size)
  }

  const refs = referencedImages(css)
  for (const base of refs) {
    const s2 = sizes.get(`${IMAGES_DIR}/${base}@2x.png`)
    const s3 = sizes.get(`${IMAGES_DIR}/${base}@3x.png`)
    if (!s2 || !s3) {
      issues.push({ code: 'missing-image', path: base, detail: `@2x:${Boolean(s2)} @3x:${Boolean(s3)}` })
      continue
    }
    // @2x × 1.5 ≈ @3x (allow rounding of fractional pt sizes).
    if (Math.abs(s2.width * 1.5 - s3.width) > 2 || Math.abs(s2.height * 1.5 - s3.height) > 2) {
      issues.push({ code: 'scale-mismatch', path: base, detail: `${s2.width}x${s2.height} vs ${s3.width}x${s3.height}` })
    }
  }

  for (const path of files.keys()) {
    const m = /^Images\/([A-Za-z0-9_]+?)(@[23]x)?\.png$/.exec(path)
    if (!m) continue
    if (`${m[1]}.png` === THEME_ICON_FILE && !m[2]) continue
    if (!refs.has(m[1])) issues.push({ code: 'orphan-image', path, detail: 'Not referenced by CSS' })
  }

  for (const selector of ['MessageCellStyle-Send', 'MessageCellStyle-Receive']) {
    const props = parsed.get(selector)
    for (const prop of BUBBLE_PROPS) {
      const value = props?.get(prop)
      const m = value && /'([^']+)\.png'\s+([\d.]+)px\s+([\d.]+)px/.exec(value)
      if (!m) {
        issues.push({ code: 'missing-image', path: `${selector} ${prop}`, detail: 'Missing bubble image declaration' })
        continue
      }
      const s3 = sizes.get(`${IMAGES_DIR}/${m[1]}@3x.png`)
      if (!s3) continue
      const x = Number(m[2])
      const y = Number(m[3])
      if (x < 0 || y < 0 || x >= s3.width / 3 || y >= s3.height / 3) {
        issues.push({ code: 'stretch-out-of-bounds', path: `${selector} ${prop}`, detail: `${x},${y} outside ${s3.width / 3}x${s3.height / 3}pt` })
      }
    }
  }

  return issues
}
