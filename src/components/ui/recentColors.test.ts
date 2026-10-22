import { describe, expect, it } from 'vitest'
import { pushRecent, RECENT_COLORS_MAX } from './recentColors'

describe('pushRecent', () => {
  it('puts the newest first, moves repeats to the front and keeps the limit', () => {
    expect(pushRecent([], '#111111')).toEqual(['#111111'])
    expect(pushRecent(['#111111', '#222222'], '#222222')).toEqual(['#222222', '#111111'])
    const full = Array.from({ length: RECENT_COLORS_MAX }, (_, i) => `#00000${i}`)
    const next = pushRecent(full, '#ffffff')
    expect(next).toHaveLength(RECENT_COLORS_MAX)
    expect(next[0]).toBe('#ffffff')
    expect(next).not.toContain(full[RECENT_COLORS_MAX - 1])
  })
})
