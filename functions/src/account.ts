/** 회원 탈퇴 needs a sign-in within this window, so an old session left open cannot delete the account. */
export const RECENT_LOGIN_MS = 10 * 60 * 1000

/** `authTime` is the ID token's auth_time claim (seconds since epoch). */
export function isRecentLogin(authTime: unknown, now: number): boolean {
  if (typeof authTime !== 'number' || !Number.isFinite(authTime)) return false
  const age = now - authTime * 1000
  return age >= -60_000 && age <= RECENT_LOGIN_MS
}
