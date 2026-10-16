import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions'
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage'
import type { CloudConfig } from './config'
import { createAuthServices, EMULATOR_PORTS, type CloudAuthServices } from './firebaseAuth'

export interface CloudServices extends CloudAuthServices {
  db: Firestore
  storage: FirebaseStorage
  functions: Functions
}

/**
 * Adds Firestore, Storage and Functions to an initialized app. Firestore uses the SDK
 * default memory cache: nothing from a signed-in account is persisted to disk by
 * Firestore, so signing out or switching accounts cannot leak private documents from cache.
 */
export function addDataServices(base: CloudAuthServices, config: CloudConfig): CloudServices {
  const db = getFirestore(base.app)
  const storage = getStorage(base.app)
  const functions = getFunctions(base.app, config.functionsRegion)
  if (config.emulatorHost) {
    const host = config.emulatorHost
    connectFirestoreEmulator(db, host, EMULATOR_PORTS.firestore)
    connectStorageEmulator(storage, host, EMULATOR_PORTS.storage)
    connectFunctionsEmulator(functions, host, EMULATOR_PORTS.functions)
  } else if (config.appCheckSiteKey) {
    // Attests calls to Functions (download counting) when configured. Loaded on demand so
    // builds without a site key do not ship it; a call before it is ready simply is not counted.
    const siteKey = config.appCheckSiteKey
    void import('firebase/app-check')
      .then(({ initializeAppCheck, ReCaptchaEnterpriseProvider }) =>
        initializeAppCheck(base.app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true }),
      )
      .catch(() => undefined)
  }
  return { ...base, db, storage, functions }
}

export function createCloudServices(config: CloudConfig, name?: string): CloudServices {
  return addDataServices(createAuthServices(config, name), config)
}
