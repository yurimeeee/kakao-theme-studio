import { describe, expect, it } from 'vitest'
import { THEME_NAME_MAX_LENGTH } from '@/domain/theme/defaults'
import { copyName } from './duplicate'

describe('copyName', () => {
  it('adds the suffix and keeps the name within the limit', () => {
    expect(copyName('봄 테마')).toBe('봄 테마 사본')
    const long = copyName('가'.repeat(THEME_NAME_MAX_LENGTH))
    expect(long).toHaveLength(THEME_NAME_MAX_LENGTH)
    expect(long.endsWith(' 사본')).toBe(true)
    expect(copyName('가'.repeat(26) + '   끝')).toBe('가'.repeat(26) + ' 사본')
  })
})
