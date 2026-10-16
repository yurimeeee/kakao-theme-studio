import type { FirebaseOptions } from 'firebase/app'

/**
 * Cloud (2차) configuration from Vite env. Pure: does not import the Firebase SDK, so
 * the app can decide whether to show cloud features without loading it.
 *
 * All values here are public client configuration. Server secrets (Kakao client secret,
 * Admin credentials) live only in Cloud Functions secrets — never in VITE_ variables.
 */
export interface CloudConfig {
  firebase: FirebaseOptions & { projectId: string }
  /** `host` of the local Firebase Emulator Suite, or null for production services. */
  emulatorHost: string | null
  functionsRegion: string
  /** Kakao REST API key (= OAuth client_id, public). null hides 카카오 로그인 as 준비 중. */
  kakaoClientId: string | null
  /** reCAPTCHA Enterprise site key for App Check (public). null = App Check off. */
  appCheckSiteKey: string | null
}

export const DEFAULT_FUNCTIONS_REGION = 'asia-northeast3'

type Env = Record<string, string | boolean | undefined>

function str(env: Env, key: string): string | null {
  const v = env[key]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export function readCloudConfig(env: Env): CloudConfig | null {
  const projectId = str(env, 'VITE_FIREBASE_PROJECT_ID')
  const apiKey = str(env, 'VITE_FIREBASE_API_KEY')
  const emulatorHost = str(env, 'VITE_FIREBASE_EMULATOR_HOST')
  if (!projectId || !apiKey) return null
  // Emulator mode only for demo-* projects, so a misconfigured build can never point
  // production credentials at a local emulator (or the other way around).
  if (emulatorHost && !projectId.startsWith('demo-')) return null
  return {
    firebase: {
      apiKey,
      projectId,
      authDomain: str(env, 'VITE_FIREBASE_AUTH_DOMAIN') ?? `${projectId}.firebaseapp.com`,
      storageBucket: str(env, 'VITE_FIREBASE_STORAGE_BUCKET') ?? `${projectId}.appspot.com`,
      appId: str(env, 'VITE_FIREBASE_APP_ID') ?? undefined,
    },
    emulatorHost,
    functionsRegion: str(env, 'VITE_FIREBASE_FUNCTIONS_REGION') ?? DEFAULT_FUNCTIONS_REGION,
    kakaoClientId: str(env, 'VITE_KAKAO_REST_API_KEY'),
    appCheckSiteKey: str(env, 'VITE_FIREBASE_APPCHECK_SITE_KEY'),
  }
}

export const cloudConfig: CloudConfig | null = readCloudConfig(import.meta.env as Env)
export const isCloudConfigured = cloudConfig !== null
