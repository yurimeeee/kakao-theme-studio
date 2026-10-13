/**
 * Gallery search tokens, written only by the server (onShareWritten) so a publisher cannot
 * make a theme match searches unrelated to its name.
 *
 * normalizeSearchText must stay identical to the client's (src/cloud/model.ts), which
 * normalizes the query the same way; src/cloud/cloud.test.ts checks they agree.
 */

/** Same limit as THEME_NAME_MAX_LENGTH on the client and validName() in the rules. */
export const SEARCH_NAME_MAX_LENGTH = 30

export function normalizeSearchText(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Every substring of the normalized name. Firestore has no substring search, so the
 * gallery matches one `array-contains` token — the full normalized query. Names are at
 * most 30 characters, so this is at most 465 tokens per published theme.
 */
export function searchTokens(name: string): string[] {
  const n = normalizeSearchText(name).slice(0, SEARCH_NAME_MAX_LENGTH)
  const out = new Set<string>()
  for (let i = 0; i < n.length; i++) {
    for (let j = i + 1; j <= n.length; j++) {
      const t = n.slice(i, j)
      if (t.trim()) out.add(t)
    }
  }
  return [...out]
}

export function sameTokens(a: unknown, b: readonly string[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((t, i) => t === b[i])
}
