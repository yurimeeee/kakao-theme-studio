import { describe, expect, it, vi } from 'vitest'
import { downloadActor, downloadMarkId, clientIp, utcDay } from './downloads.js'
import { exchangeKakaoCode, isAllowedRedirect, KAKAO_TOKEN_URL, KakaoAuthError, kakaoUid, type FetchLike } from './kakao.js'

const CODE = 'abcDEF123_-xyz0987'

function fakeFetch(token: { status: number; body: unknown }, user?: { status: number; body: unknown }) {
  return vi.fn<FetchLike>(async (url) => {
    const r = url === KAKAO_TOKEN_URL ? token : user!
    return { ok: r.status < 400, status: r.status, json: async () => r.body }
  })
}

const base = { code: CODE, redirectUri: 'https://example.app/auth/kakao/callback', clientId: 'rest-key', clientSecret: 'shh' }

describe('exchangeKakaoCode', () => {
  it('exchanges the code server-side with the secret and maps the Kakao id', async () => {
    const f = fakeFetch(
      { status: 200, body: { access_token: 'AT' } },
      { status: 200, body: { id: 123456789, kakao_account: { profile: { nickname: ' 라이언 ', profile_image_url: 'https://k.kakaocdn.net/p.jpg' } } } },
    )
    const profile = await exchangeKakaoCode({ ...base, fetch: f })
    expect(profile).toEqual({ kakaoId: '123456789', nickname: '라이언', photoURL: 'https://k.kakaocdn.net/p.jpg' })
    expect(kakaoUid(profile.kakaoId)).toBe('kakao:123456789')
    const body = new URLSearchParams(f.mock.calls[0][1].body)
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('client_secret')).toBe('shh')
    expect(body.get('redirect_uri')).toBe(base.redirectUri)
    expect(f.mock.calls[1][1].headers.Authorization).toBe('Bearer AT')
  })

  it('rejects a reused or invalid code as invalid-grant, without calling the user API', async () => {
    const f = fakeFetch({ status: 400, body: { error: 'invalid_grant' } })
    await expect(exchangeKakaoCode({ ...base, fetch: f })).rejects.toMatchObject({ code: 'invalid-grant' })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('treats Kakao outages as unavailable, not as a login failure', async () => {
    await expect(exchangeKakaoCode({ ...base, fetch: fakeFetch({ status: 503, body: {} }) })).rejects.toMatchObject({ code: 'kakao-unavailable' })
    const throwing: FetchLike = async () => {
      throw new Error('ECONNRESET')
    }
    await expect(exchangeKakaoCode({ ...base, fetch: throwing })).rejects.toMatchObject({ code: 'kakao-unavailable' })
  })

  it('rejects malformed codes and profiles', async () => {
    await expect(exchangeKakaoCode({ ...base, code: 'bad code!', fetch: fakeFetch({ status: 200, body: {} }) })).rejects.toBeInstanceOf(KakaoAuthError)
    const noId = fakeFetch({ status: 200, body: { access_token: 'AT' } }, { status: 200, body: { kakao_account: {} } })
    await expect(exchangeKakaoCode({ ...base, fetch: noId })).rejects.toMatchObject({ code: 'invalid-profile' })
    const badId = fakeFetch({ status: 200, body: { access_token: 'AT' } }, { status: 200, body: { id: '../admin' } })
    await expect(exchangeKakaoCode({ ...base, fetch: badId })).rejects.toMatchObject({ code: 'invalid-profile' })
  })

  it('drops non-https profile images and empty nicknames', async () => {
    const f = fakeFetch({ status: 200, body: { access_token: 'AT' } }, { status: 200, body: { id: 7, kakao_account: { profile: { nickname: '  ', profile_image_url: 'http://x' } } } })
    expect(await exchangeKakaoCode({ ...base, fetch: f })).toEqual({ kakaoId: '7', nickname: null, photoURL: null })
  })
})

describe('isAllowedRedirect', () => {
  it('matches the allow-list exactly', () => {
    const list = 'https://a.app/auth/kakao/callback, http://localhost:5173/auth/kakao/callback'
    expect(isAllowedRedirect('http://localhost:5173/auth/kakao/callback', list)).toBe(true)
    expect(isAllowedRedirect('https://a.app/auth/kakao/callback?x=1', list)).toBe(false)
    expect(isAllowedRedirect('https://evil.app/auth/kakao/callback', list)).toBe(false)
    expect(isAllowedRedirect('', '')).toBe(false)
  })
})

describe('download de-duplication keys', () => {
  it('uses the uid when signed in and a salted IP hash otherwise', () => {
    expect(downloadActor('u1', '1.2.3.4', 's')).toBe('u:u1')
    const a = downloadActor(null, '1.2.3.4', 's')
    expect(a).toMatch(/^ip:[0-9a-f]{32}$/)
    expect(a).not.toContain('1.2.3.4')
    expect(downloadActor(null, '1.2.3.4', 'other-salt')).not.toBe(a)
  })

  it('is stable within a UTC day and changes across days and shares', () => {
    const day = utcDay(Date.UTC(2026, 9, 11, 23, 59))
    expect(day).toBe('2026-10-11')
    const id = downloadMarkId('S'.repeat(22), 'u:u1', day)
    expect(downloadMarkId('S'.repeat(22), 'u:u1', day)).toBe(id)
    expect(downloadMarkId('S'.repeat(22), 'u:u1', '2026-10-12')).not.toBe(id)
    expect(downloadMarkId('T'.repeat(22), 'u:u1', day)).not.toBe(id)
  })

  it('takes the first forwarded IP', () => {
    // Only the entry appended by Google's front end counts; client-supplied ones are ignored.
    expect(clientIp({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' }, '127.0.0.1')).toBe('203.0.113.7')
    expect(clientIp({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 203.0.113.7' }, '127.0.0.1')).toBe('203.0.113.7')
    expect(clientIp({ 'x-forwarded-for': ['9.9.9.9', '203.0.113.7'] }, '127.0.0.1')).toBe('203.0.113.7')
    expect(clientIp({ 'x-forwarded-for': '203.0.113.7' }, '127.0.0.1')).toBe('203.0.113.7')
    expect(clientIp({}, '127.0.0.1')).toBe('127.0.0.1')
  })
})
