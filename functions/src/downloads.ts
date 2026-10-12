import { createHash } from 'node:crypto'

/**
 * 인기순 집계 기준: a share's downloadCount counts at most one download per actor per
 * UTC day. Actor = signed-in uid, otherwise a salted hash of the client IP (the raw IP
 * is never stored). The owner's own downloads are not counted.
 */

export const SHARE_ID_PATTERN = /^[A-Za-z0-9]{22}$/
export const MARK_TTL_MS = 2 * 24 * 60 * 60 * 1000

/**
 * Client IP for de-duplication. Google's front end *appends* the address it accepted the
 * connection from to X-Forwarded-For, so only the rightmost entry is trustworthy; anything
 * to its left is whatever the client sent and could be rotated to inflate downloadCount.
 * (Assumes no extra load balancer in front of the function; one would add another hop.)
 */
export function clientIp(headers: Record<string, string | string[] | undefined>, fallback: string | undefined): string {
  const fwd = headers['x-forwarded-for']
  const entries = (Array.isArray(fwd) ? fwd.join(',') : (fwd ?? ''))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return entries.at(-1) || fallback || 'unknown'
}

export function downloadActor(uid: string | null, ip: string, salt: string): string {
  if (uid) return `u:${uid}`
  return `ip:${createHash('sha256').update(`${salt}|${ip}`).digest('hex').slice(0, 32)}`
}

export const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10)

export function downloadMarkId(shareId: string, actor: string, day: string): string {
  return createHash('sha256').update(`${shareId}|${actor}|${day}`).digest('hex')
}
