const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

function randomToken(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}

/** Local project id. Distinct prefix from cloud ids so the two are never confused. */
export function createLocalProjectId(): string {
  return `lp_${Date.now().toString(36)}${randomToken(10)}`
}

export function createAssetId(): string {
  return `ast_${Date.now().toString(36)}${randomToken(10)}`
}

/**
 * Theme id written into the .ktheme manifest. ASCII letters/digits/underscore only,
 * matching the character set observed in the reference archive (`COL_chiikawa`).
 */
export function createExportThemeId(): string {
  return `KTS_${randomToken(16)}`
}

export const isLocalProjectId = (id: string) => /^lp_[0-9a-z]+$/.test(id)
export const isAssetId = (id: unknown): id is string => typeof id === 'string' && /^ast_[0-9a-z]+$/.test(id)
