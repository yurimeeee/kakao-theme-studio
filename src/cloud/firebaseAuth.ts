import { initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import type { CloudConfig } from './config'

export interface CloudAuthServices {
  app: FirebaseApp
  auth: Auth
}

export const EMULATOR_PORTS = { auth: 9099, firestore: 8180, storage: 9199, functions: 5001 } as const

/** Firebase App + Auth only (kept separate from the data SDKs so startup loads less). */
export function createAuthServices(config: CloudConfig, name?: string): CloudAuthServices {
  const app = initializeApp(config.firebase, name)
  const auth = getAuth(app)
  if (config.emulatorHost) connectAuthEmulator(auth, `http://${config.emulatorHost}:${EMULATOR_PORTS.auth}`, { disableWarnings: true })
  return { app, auth }
}
