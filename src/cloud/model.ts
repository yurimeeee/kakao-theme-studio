import type { SupportedImageMime } from '@/assets/types'
import type { AssetId } from '@/domain/theme/types'

/**
 * Firestore / Storage data model (2차). See docs/cloud.md for the full layout.
 *
 * themes/{themeId}                        owner-only working copy
 * themes/{themeId}/revisions/{revisionId} owner-only saved revision
 * shares/{shareId}                        published snapshot (공개 / 링크 공개)
 *
 * users/{uid}/themes/{themeId}/assets/{sha256}.{ext}
 * users/{uid}/themes/{themeId}/thumbnails/{revisionId}.png
 * shares/{shareId}/assets/{sha256}.{ext}
 * shares/{shareId}/thumbnails/{revisionId}.png
 *
 * Images never go into Firestore; documents hold only metadata and Storage paths.
 */

export type Visibility = 'private' | 'public' | 'unlisted'
export const VISIBILITIES: readonly Visibility[] = ['private', 'unlisted', 'public']

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  private: '비공개',
  unlisted: '링크 공개',
  public: '공개',
}

export const VISIBILITY_DESCRIPTIONS: Record<Visibility, string> = {
  private: '나만 볼 수 있어요.',
  unlisted: '링크를 받은 사람은 로그인 없이 보고 내려받을 수 있어요. 갤러리에는 나오지 않아요.',
  public: '갤러리에 표시되고 누구나 로그인 없이 보고 내려받을 수 있어요.',
}

/** Metadata for one stored image, keyed by the config's AssetId. */
export interface CloudAssetEntry {
  hash: string
  ext: 'png' | 'jpg' | 'webp'
  mime: SupportedImageMime
  width: number
  height: number
  size: number
  name: string
  /** Full Storage path. */
  path: string
}

export type AssetManifest = Record<AssetId, CloudAssetEntry>

export const EXT_BY_MIME: Record<SupportedImageMime, CloudAssetEntry['ext']> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export const userAssetPath = (uid: string, themeId: string, hash: string, ext: string) => `users/${uid}/themes/${themeId}/assets/${hash}.${ext}`
export const userThumbnailPath = (uid: string, themeId: string, revisionId: string) => `users/${uid}/themes/${themeId}/thumbnails/${revisionId}.png`
export const shareAssetPath = (shareId: string, hash: string, ext: string) => `shares/${shareId}/assets/${hash}.${ext}`
export const shareThumbnailPath = (shareId: string, revisionId: string) => `shares/${shareId}/thumbnails/${revisionId}.png`

const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomId(length: number): string {
  // Rejection sampling keeps the distribution uniform over the alphabet.
  const out: string[] = []
  const limit = 256 - (256 % ID_ALPHABET.length)
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2))
    for (const b of bytes) {
      if (b < limit && out.length < length) out.push(ID_ALPHABET[b % ID_ALPHABET.length])
    }
  }
  return out.join('')
}

/** Share link id: 22 chars from a 56-symbol alphabet (~128 bits) — not guessable. */
export const createShareId = () => randomId(22)
export const createRevisionId = () => `r${Date.now().toString(36)}${randomId(8)}`
export const isShareId = (id: string) => /^[A-Za-z0-9]{22}$/.test(id)

/** Search normalization shared by indexing (publish) and querying (gallery). */
/** Gallery query normalization; must match functions/src/search.ts, which builds the tokens. */
export function normalizeSearchText(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
}

export const OWNER_NAME_MAX_LENGTH = 40
export const ANONYMOUS_OWNER = '이름 없는 제작자'

export function ownerDisplayName(displayName: string | null | undefined): string {
  const clean = (displayName ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, OWNER_NAME_MAX_LENGTH)
  return clean || ANONYMOUS_OWNER
}
