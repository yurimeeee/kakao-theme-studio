import { beforeEach, describe, expect, it, vi } from 'vitest'
import { completeKakaoLogin, KakaoLoginError } from './auth'
import { readCloudConfig } from './config'
import { CloudError, cloudErrorMessage, toCloudError } from './errors'
import { createShareId, isShareId, normalizeSearchText, ownerDisplayName, searchTokens } from './model'

describe('readCloudConfig', () => {
  it('stays local-only without Firebase config', () => {
    expect(readCloudConfig({})).toBeNull()
    expect(readCloudConfig({ VITE_FIREBASE_PROJECT_ID: 'p' })).toBeNull()
  })

  it('reads the public web config and defaults', () => {
    const c = readCloudConfig({ VITE_FIREBASE_PROJECT_ID: 'kts-prod', VITE_FIREBASE_API_KEY: 'k', VITE_KAKAO_REST_API_KEY: ' kakao ' })
    expect(c).toMatchObject({
      firebase: { projectId: 'kts-prod', apiKey: 'k', authDomain: 'kts-prod.firebaseapp.com', storageBucket: 'kts-prod.appspot.com' },
      emulatorHost: null,
      functionsRegion: 'asia-northeast3',
      kakaoClientId: 'kakao',
    })
  })

  it('never points a real project at the emulator', () => {
    expect(readCloudConfig({ VITE_FIREBASE_PROJECT_ID: 'kts-prod', VITE_FIREBASE_API_KEY: 'k', VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1' })).toBeNull()
    expect(readCloudConfig({ VITE_FIREBASE_PROJECT_ID: 'demo-x', VITE_FIREBASE_API_KEY: 'k', VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1' })?.emulatorHost).toBe('127.0.0.1')
  })
})

describe('search tokens', () => {
  it('indexes every substring of the normalized name so any part matches one array-contains query', () => {
    const tokens = searchTokens('Soft 그레이')
    for (const q of ['soft', '그레이', 't 그', 'soft 그레이', '레']) expect(tokens).toContain(normalizeSearchText(q))
    expect(tokens).not.toContain(' ')
    expect(new Set(tokens).size).toBe(tokens.length)
  })

  it('normalizes case, Unicode form and spaces the same way for names and queries', () => {
    const decomposed = '그레이'.normalize('NFD')
    expect(normalizeSearchText(`  SOFT   ${decomposed} `)).toBe('soft 그레이')
    expect(searchTokens(`SOFT ${decomposed}`)).toContain('soft 그레이')
  })

  it('stays within the Firestore rule limit for the longest name', () => {
    expect(searchTokens('가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나').length).toBeLessThanOrEqual(500)
  })
})

describe('share ids and owner names', () => {
  it('creates unguessable share ids', () => {
    const ids = new Set(Array.from({ length: 200 }, createShareId))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(isShareId(id)).toBe(true)
  })

  it('never exposes an empty owner name', () => {
    expect(ownerDisplayName('  ')).toBe('이름 없는 제작자')
    expect(ownerDisplayName(null)).toBe('이름 없는 제작자')
    expect(ownerDisplayName(' 유림 ')).toBe('유림')
  })
})

describe('cloud errors', () => {
  it('maps SDK codes to user messages', () => {
    expect(toCloudError({ code: 'permission-denied' }).kind).toBe('permission')
    expect(toCloudError({ code: 'storage/unauthorized' }).kind).toBe('permission')
    expect(toCloudError({ code: 'unavailable' }).kind).toBe('network')
    expect(cloudErrorMessage(new CloudError('conflict', 'x'))).toContain('먼저 저장')
  })
})

describe('completeKakaoLogin', () => {
  const fakeAuth = {} as never

  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', { location: { origin: 'https://studio.example' } })
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    })
  })

  function stash(state: string, at = Date.now()) {
    sessionStorage.setItem('kts.kakao-login', JSON.stringify({ state, returnTo: '#/projects', at }))
  }

  it('rejects a callback whose state does not match (CSRF) before calling the server', async () => {
    stash('expected')
    const exchange = vi.fn()
    await expect(completeKakaoLogin(fakeAuth, exchange, '?code=abc&state=forged')).rejects.toMatchObject({ reason: 'state' })
    expect(exchange).not.toHaveBeenCalled()
    // One-shot: the stored state is consumed even on failure.
    expect(sessionStorage.getItem('kts.kakao-login')).toBeNull()
  })

  it('rejects stale or missing state', async () => {
    stash('s', Date.now() - 11 * 60 * 1000)
    const exchange = vi.fn()
    await expect(completeKakaoLogin(fakeAuth, exchange, '?code=abc&state=s')).rejects.toBeInstanceOf(KakaoLoginError)
    await expect(completeKakaoLogin(fakeAuth, exchange, '?code=abc&state=s')).rejects.toMatchObject({ reason: 'state' })
    expect(exchange).not.toHaveBeenCalled()
  })

  it('reports a cancelled consent', async () => {
    stash('s')
    await expect(completeKakaoLogin(fakeAuth, vi.fn(), '?error=access_denied&state=s')).rejects.toMatchObject({ reason: 'cancelled' })
  })

  it('sends the code and the exact redirect URI to the server exchange', async () => {
    stash('s')
    const exchange = vi.fn().mockRejectedValue(new Error('kakao-not-configured'))
    await expect(completeKakaoLogin(fakeAuth, exchange, '?code=abc123&state=s')).rejects.toMatchObject({ reason: 'server' })
    expect(exchange).toHaveBeenCalledWith('abc123', 'https://studio.example/auth/kakao/callback')
  })
})
