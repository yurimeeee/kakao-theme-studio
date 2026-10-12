/**
 * Kakao OAuth (authorization code) → Firebase uid mapping. Pure logic; the HTTP
 * client is injected so it can be tested without network access.
 *
 * The client secret is used only here, on the server. The browser never sees it.
 */

export const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token'
export const KAKAO_USER_URL = 'https://kapi.kakao.com/v2/user/me'

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

export class KakaoAuthError extends Error {
  readonly code: 'invalid-request' | 'invalid-grant' | 'kakao-unavailable' | 'invalid-profile'

  constructor(code: KakaoAuthError['code'], message: string) {
    super(message)
    this.code = code
    this.name = 'KakaoAuthError'
  }
}

export interface KakaoProfile {
  kakaoId: string
  nickname: string | null
  photoURL: string | null
}

/** Firebase uid for a Kakao account. Prefixed so it can never collide with Firebase-generated uids. */
export const kakaoUid = (kakaoId: string) => `kakao:${kakaoId}`

/** Accepts only redirect URIs from the configured allow-list (exact match). */
export function isAllowedRedirect(redirectUri: string, allowList: string): boolean {
  const allowed = allowList
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return allowed.includes(redirectUri)
}

export async function exchangeKakaoCode(params: {
  code: string
  redirectUri: string
  clientId: string
  clientSecret: string
  fetch: FetchLike
}): Promise<KakaoProfile> {
  const { code, redirectUri, clientId, clientSecret } = params
  if (!/^[A-Za-z0-9_-]{10,512}$/.test(code)) throw new KakaoAuthError('invalid-request', 'Malformed authorization code')

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
  })
  if (clientSecret) body.set('client_secret', clientSecret)

  let tokenRes
  try {
    tokenRes = await params.fetch(KAKAO_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: body.toString(),
    })
  } catch {
    throw new KakaoAuthError('kakao-unavailable', 'Kakao token endpoint unreachable')
  }
  const token = (await tokenRes.json().catch(() => ({}))) as { access_token?: unknown; error?: unknown }
  if (!tokenRes.ok || typeof token.access_token !== 'string') {
    // 4xx from the token endpoint = bad/expired/reused code or redirect mismatch.
    if (tokenRes.status >= 400 && tokenRes.status < 500) throw new KakaoAuthError('invalid-grant', `Kakao token error: ${String(token.error ?? tokenRes.status)}`)
    throw new KakaoAuthError('kakao-unavailable', `Kakao token endpoint status ${tokenRes.status}`)
  }

  let userRes
  try {
    userRes = await params.fetch(KAKAO_USER_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
  } catch {
    throw new KakaoAuthError('kakao-unavailable', 'Kakao user endpoint unreachable')
  }
  if (!userRes.ok) throw new KakaoAuthError('kakao-unavailable', `Kakao user endpoint status ${userRes.status}`)
  const user = (await userRes.json().catch(() => ({}))) as {
    id?: unknown
    kakao_account?: { profile?: { nickname?: unknown; profile_image_url?: unknown } }
  }
  if (typeof user.id !== 'number' && typeof user.id !== 'string') throw new KakaoAuthError('invalid-profile', 'Kakao user id missing')
  const kakaoId = String(user.id)
  if (!/^\d{1,20}$/.test(kakaoId)) throw new KakaoAuthError('invalid-profile', 'Kakao user id malformed')
  const nickname = user.kakao_account?.profile?.nickname
  const photo = user.kakao_account?.profile?.profile_image_url
  return {
    kakaoId,
    nickname: typeof nickname === 'string' && nickname.trim() ? nickname.trim().slice(0, 40) : null,
    photoURL: typeof photo === 'string' && photo.startsWith('https://') ? photo : null,
  }
}
