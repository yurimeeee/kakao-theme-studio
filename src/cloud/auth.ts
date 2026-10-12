import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth'

export type AuthProviderKind = 'password' | 'google' | 'kakao' | 'other'

export interface SessionUser {
  uid: string
  displayName: string | null
  email: string | null
  provider: AuthProviderKind
}

export function toSessionUser(user: User): SessionUser {
  const providerId = user.providerData[0]?.providerId
  const provider: AuthProviderKind = user.uid.startsWith('kakao:')
    ? 'kakao'
    : providerId === 'password'
      ? 'password'
      : providerId === 'google.com'
        ? 'google'
        : 'other'
  return { uid: user.uid, displayName: user.displayName, email: user.email, provider }
}

export function watchUser(auth: Auth, cb: (user: SessionUser | null) => void): () => void {
  // Completes a Google redirect sign-in (popup fallback) if one is pending; errors surface on the next attempt.
  void getRedirectResult(auth).catch(() => undefined)
  return onAuthStateChanged(auth, (u) => cb(u ? toSessionUser(u) : null))
}

export async function signInWithEmail(auth: Auth, email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email.trim(), password)
}

export async function signUpWithEmail(auth: Auth, name: string, email: string, password: string): Promise<void> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
  await updateProfile(cred.user, { displayName: name.trim().slice(0, 20) })
  // onAuthStateChanged fired before the profile update; refresh listeners with the name.
  await cred.user.reload()
}

export async function resetPassword(auth: Auth, email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email.trim())
  } catch (error) {
    // Do not reveal whether an account exists for this address.
    if ((error as { code?: string }).code === 'auth/user-not-found') return
    throw error
  }
}

export async function signInWithGoogle(auth: Auth): Promise<void> {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    await signInWithPopup(auth, provider)
  } catch (error) {
    if ((error as { code?: string }).code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, provider)
      return
    }
    throw error
  }
}

export const signOut = (auth: Auth) => firebaseSignOut(auth)

// ── 카카오 (authorization code → Cloud Function → custom token) ─────────────────────

const KAKAO_STATE_KEY = 'kts.kakao-login'
export const KAKAO_CALLBACK_PATH = '/auth/kakao/callback'

export const kakaoRedirectUri = () => `${window.location.origin}${KAKAO_CALLBACK_PATH}`

function randomState(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Leaves the app for Kakao's consent page. `returnTo` is an in-app hash route. */
export function startKakaoLogin(clientId: string, returnTo: string): void {
  const state = randomState()
  sessionStorage.setItem(KAKAO_STATE_KEY, JSON.stringify({ state, returnTo, at: Date.now() }))
  const url = new URL('https://kauth.kakao.com/oauth/authorize')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', kakaoRedirectUri())
  url.searchParams.set('state', state)
  window.location.assign(url.toString())
}

export class KakaoLoginError extends Error {
  readonly reason: 'cancelled' | 'state' | 'server'

  constructor(reason: KakaoLoginError['reason'], message: string, cause?: unknown) {
    super(message, { cause })
    this.reason = reason
    this.name = 'KakaoLoginError'
  }
}

/**
 * Handles `/auth/kakao/callback?code&state`. `exchange` calls the kakaoSignIn function and
 * returns a Firebase custom token. Returns the hash route to go back to.
 */
export async function completeKakaoLogin(auth: Auth, exchange: (code: string, redirectUri: string) => Promise<string>, search: string): Promise<string> {
  const params = new URLSearchParams(search)
  const saved = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(KAKAO_STATE_KEY) ?? 'null') as { state: string; returnTo: string; at: number } | null
    } catch {
      return null
    }
  })()
  sessionStorage.removeItem(KAKAO_STATE_KEY)
  const returnTo = saved?.returnTo?.startsWith('#/') ? saved.returnTo : '#/editor'
  if (params.get('error')) throw new KakaoLoginError('cancelled', params.get('error') ?? 'cancelled')
  const code = params.get('code')
  // CSRF: the state must match what this tab sent, and be recent.
  if (!code || !saved || params.get('state') !== saved.state || Date.now() - saved.at > 10 * 60 * 1000) {
    throw new KakaoLoginError('state', 'State mismatch')
  }
  try {
    await signInWithCustomToken(auth, await exchange(code, kakaoRedirectUri()))
  } catch (error) {
    throw new KakaoLoginError('server', 'Kakao sign-in failed', error)
  }
  return returnTo
}

export function authErrorMessage(error: unknown): string | null {
  if (error instanceof KakaoLoginError) {
    if (error.reason === 'cancelled') return '카카오 로그인을 취소했어요.'
    if (error.reason === 'state') return '로그인 요청이 만료됐어요. 다시 시도해 주세요.'
    const inner = String((error.cause as { message?: string; code?: string })?.message ?? '')
    if (inner.includes('kakao-not-configured')) return '카카오 로그인을 준비하고 있어요.'
    return '카카오 로그인을 확인하지 못했어요. 다시 시도해 주세요.'
  }
  const code = String((error as { code?: unknown })?.code ?? '')
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return null
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return '이메일 또는 비밀번호가 올바르지 않아요.'
    case 'auth/email-already-in-use':
      return '이미 가입된 이메일이에요. 로그인해 주세요.'
    case 'auth/weak-password':
      return '비밀번호는 6자 이상이어야 해요.'
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return '이메일 형식을 확인해 주세요.'
    case 'auth/missing-password':
      return '비밀번호를 입력해 주세요.'
    case 'auth/too-many-requests':
      return '시도가 너무 많아요. 잠시 뒤 다시 시도해 주세요.'
    case 'auth/network-request-failed':
      return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.'
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
    case 'auth/unauthorized-domain':
      return '이 로그인 방식은 아직 준비 중이에요.'
    case 'auth/account-exists-with-different-credential':
      return '같은 이메일로 가입된 다른 로그인 방식이 있어요. 기존 방식으로 로그인해 주세요.'
    default:
      return '로그인하지 못했어요. 다시 시도해 주세요.'
  }
}
