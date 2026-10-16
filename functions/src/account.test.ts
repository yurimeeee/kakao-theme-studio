import { describe, expect, it } from 'vitest'
import { isRecentLogin, RECENT_LOGIN_MS } from './account.js'

describe('isRecentLogin', () => {
  const now = Date.UTC(2026, 9, 16, 12)
  const sec = (ms: number) => ms / 1000

  it('accepts a sign-in inside the window', () => {
    expect(isRecentLogin(sec(now - 60_000), now)).toBe(true)
    expect(isRecentLogin(sec(now - RECENT_LOGIN_MS), now)).toBe(true)
  })

  it('rejects an old session, a missing claim and a far-future claim', () => {
    expect(isRecentLogin(sec(now - RECENT_LOGIN_MS - 1000), now)).toBe(false)
    expect(isRecentLogin(undefined, now)).toBe(false)
    expect(isRecentLogin('123', now)).toBe(false)
    expect(isRecentLogin(sec(now + 5 * 60_000), now)).toBe(false)
  })
})
