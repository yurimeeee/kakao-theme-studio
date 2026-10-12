import { createHash } from 'node:crypto'

/**
 * 인기순 집계 기준: a share's downloadCount counts at most one download per actor per
 * UTC day. Actor = signed-in uid, otherwise a salted hash of the client IP (the raw IP
 * is never stored). The owner's own downloads are not counted.
 */

export const SHARE_ID_PATTERN = /^[A-Za-z0-9]{22}$/
export const MARK_TTL_MS = 2 * 24 * 60 * 60 * 1000

export function clientIp(headers: Record<string, string | string[] | undefined>, fallback: string | undefined): string {
  const fwd = headers['x-forwarded-for']
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim()
  return first || fallback || 'unknown'
}

export function downloadActor(uid: string | null, ip: string, salt: string): string {
  if (uid) return `u:${uid}`
  return `ip:${createHash('sha256').update(`${salt}|${ip}`).digest('hex').slice(0, 32)}`
}

export const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10)

export function downloadMarkId(shareId: string, actor: string, day: string): string {
  return createHash('sha256').update(`${shareId}|${actor}|${day}`).digest('hex')
}
