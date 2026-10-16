import { httpsCallable } from 'firebase/functions'
import { CloudThemeRepository } from '@/repositories/cloud/cloudThemes'
import { ShareRepository } from '@/repositories/cloud/shares'
import { getAuthRuntime } from './authRuntime'
import { cloudConfig, type CloudConfig } from './config'
import { CloudError, toCloudError } from './errors'
import { addDataServices, type CloudServices } from './firebase'

/**
 * Firestore / Storage / Functions and the cloud repositories, behind a second dynamic
 * import (see features/auth/session.ts): loaded only when a cloud feature is used.
 */
export interface CloudRuntime {
  config: CloudConfig
  services: CloudServices
  themes: CloudThemeRepository
  shares: ShareRepository
  authApi: ReturnType<typeof getAuthRuntime>['authApi']
  /** kakaoSignIn callable: authorization code → Firebase custom token. */
  exchangeKakaoCode: (code: string, redirectUri: string) => Promise<string>
  /** deleteAccount callable: removes the signed-in account and all of its cloud data. */
  deleteAccount: () => Promise<void>
}

let runtime: CloudRuntime | null = null

export function getCloudRuntime(): CloudRuntime {
  if (!cloudConfig) throw new CloudError('unavailable', 'Cloud is not configured')
  if (!runtime) {
    const base = getAuthRuntime()
    const services = addDataServices(base, cloudConfig)
    const kakao = httpsCallable<{ code: string; redirectUri: string }, { token: string }>(services.functions, 'kakaoSignIn')
    const removeAccount = httpsCallable<void, { deleted: boolean }>(services.functions, 'deleteAccount')
    const themes = new CloudThemeRepository(services)
    runtime = {
      config: cloudConfig,
      services,
      themes,
      shares: new ShareRepository(services, themes),
      authApi: base.authApi,
      exchangeKakaoCode: async (code, redirectUri) => (await kakao({ code, redirectUri })).data.token,
      deleteAccount: async () => {
        try {
          await removeAccount()
        } catch (error) {
          throw toCloudError(error)
        }
      },
    }
  }
  return runtime
}
