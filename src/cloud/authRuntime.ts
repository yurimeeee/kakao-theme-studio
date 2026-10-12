import * as authApi from './auth'
import { cloudConfig } from './config'
import { CloudError } from './errors'
import { createAuthServices, type CloudAuthServices } from './firebaseAuth'

/** Firebase App + Auth only: what the app needs at startup to know who is signed in. */
let services: CloudAuthServices | null = null

export function getAuthRuntime() {
  if (!cloudConfig) throw new CloudError('unavailable', 'Cloud is not configured')
  services ??= createAuthServices(cloudConfig)
  return { ...services, authApi }
}
