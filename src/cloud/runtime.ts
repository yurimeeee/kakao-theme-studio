import { httpsCallable } from 'firebase/functions'
import { CloudThemeRepository } from '@/repositories/cloud/cloudThemes'
import { ShareRepository } from '@/repositories/cloud/shares'
import { getAuthRuntime } from './authRuntime'
import { cloudConfig, type CloudConfig } from './config'
import { CloudError } from './errors'
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
}

let runtime: CloudRuntime | null = null

export function getCloudRuntime(): CloudRuntime {
  if (!cloudConfig) throw new CloudError('unavailable', 'Cloud is not configured')
  if (!runtime) {
    const base = getAuthRuntime()
    const services = addDataServices(base, cloudConfig)
    const kakao = httpsCallable<{ code: string; redirectUri: string }, { token: string }>(services.functions, 'kakaoSignIn')
    runtime = {
      config: cloudConfig,
      services,
      themes: new CloudThemeRepository(services),
      shares: new ShareRepository(services),
      authApi: base.authApi,
      exchangeKakaoCode: async (code, redirectUri) => (await kakao({ code, redirectUri })).data.token,
    }
  }
  return runtime
}
