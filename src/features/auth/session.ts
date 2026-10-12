import { create } from 'zustand'
import type { SessionUser } from '@/cloud/auth'
import { isCloudConfigured } from '@/cloud/config'
import { CloudError } from '@/cloud/errors'
import type { CloudRuntime } from '@/cloud/runtime'

export type SessionStatus = 'unavailable' | 'loading' | 'signed-out' | 'signed-in'

interface SessionState {
  status: SessionStatus
  user: SessionUser | null
}

/** Auth state for the whole app. 'unavailable' = no cloud configuration (local-only build). */
export const useSession = create<SessionState>(() => ({
  status: isCloudConfigured ? 'loading' : 'unavailable',
  user: null,
}))

let authPromise: Promise<ReturnType<typeof import('@/cloud/authRuntime').getAuthRuntime>> | null = null
let runtimePromise: Promise<CloudRuntime> | null = null

/** Loads Firebase App + Auth (small) — enough to know who is signed in and to sign in/out. */
export function loadAuth() {
  if (!isCloudConfigured) return Promise.reject(new CloudError('unavailable', 'Cloud is not configured'))
  authPromise ??= import('@/cloud/authRuntime').then((m) => m.getAuthRuntime())
  return authPromise
}

/** Loads the data SDKs and repositories on first cloud use. */
export function loadCloud(): Promise<CloudRuntime> {
  if (!isCloudConfigured) return Promise.reject(new CloudError('unavailable', 'Cloud is not configured'))
  runtimePromise ??= import('@/cloud/runtime').then((m) => m.getCloudRuntime())
  return runtimePromise
}

type AccountListener = (next: SessionUser | null, previous: SessionUser | null) => void
const accountListeners = new Set<AccountListener>()

/** Called when the signed-in account changes (sign-in, sign-out, switch) — not on token refresh. */
export function onAccountChange(fn: AccountListener): () => void {
  accountListeners.add(fn)
  return () => accountListeners.delete(fn)
}

let initialized = false

export function initSession(): void {
  if (initialized || !isCloudConfigured) return
  initialized = true
  loadAuth()
    .then((rt) =>
      rt.authApi.watchUser(rt.auth, (user) => {
        const prev = useSession.getState().user
        useSession.setState({ status: user ? 'signed-in' : 'signed-out', user })
        if (prev?.uid !== user?.uid) accountListeners.forEach((fn) => fn(user, prev))
      }),
    )
    .catch(() => useSession.setState({ status: 'signed-out', user: null }))
}

/** Updates the displayed profile after a change that onAuthStateChanged does not report (e.g. name). */
export function refreshSessionUser(user: SessionUser): void {
  if (useSession.getState().user?.uid === user.uid) useSession.setState({ user })
}

/** uid that local cloud-linked copies must match to be shown; null while signed out or loading. */
export const currentUid = () => useSession.getState().user?.uid ?? null

/** Whether a local project may be shown under the current session (private cache protection). */
export function isVisibleLocally(cloudOwnerId: string | null): boolean {
  return cloudOwnerId === null || cloudOwnerId === currentUid()
}
