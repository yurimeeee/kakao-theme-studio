import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import type { AssetRecord } from '@/assets/types'
import type { CloudConfig } from '@/cloud/config'
import { createCloudServices, type CloudServices } from '@/cloud/firebase'
import { centerFocus, createNewProject } from '@/domain/theme/defaults'
import type { AssetId, ThemeProject } from '@/domain/theme/types'

export const EMULATOR_CONFIG: CloudConfig = {
  firebase: {
    apiKey: 'demo-api-key',
    projectId: 'demo-kakao-theme-studio',
    authDomain: 'demo-kakao-theme-studio.firebaseapp.com',
    storageBucket: 'demo-kakao-theme-studio.appspot.com',
  },
  emulatorHost: '127.0.0.1',
  functionsRegion: 'asia-northeast3',
  kakaoClientId: null,
  appCheckSiteKey: null,
}

let seq = 0
const unique = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function anonymousClient(): CloudServices {
  return createCloudServices(EMULATOR_CONFIG, `anon-${unique()}`)
}

export async function signedInClient(displayName = '테스터'): Promise<CloudServices & { uid: string }> {
  const services = createCloudServices(EMULATOR_CONFIG, `user-${unique()}`)
  const cred = await createUserWithEmailAndPassword(services.auth, `u${unique()}@example.test`, 'password-123')
  await updateProfile(cred.user, { displayName })
  return { ...services, uid: cred.user.uid }
}

/** Distinct tiny "images": rules check content type, not pixels. */
export function fakeAsset(id: AssetId, seed: string, projectId = 'lp_test'): AssetRecord {
  const bytes = new TextEncoder().encode(`\x89PNG-${seed}`)
  const hash = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').padEnd(64, '0').slice(0, 64)
  return {
    id,
    projectId,
    blob: new Blob([bytes], { type: 'image/png' }),
    mime: 'image/png',
    width: 10,
    height: 10,
    size: bytes.length,
    hash,
    name: `${seed}.png`,
    createdAt: 0,
    lastAttachedAt: 0,
  }
}

/** Chat-room background image (active) + default-profile image kept while in 기본 mode (inactive). */
export function projectWithImages(name = '구름 테마'): { project: ThemeProject; assets: Map<AssetId, AssetRecord> } {
  const project = createNewProject()
  project.name = name
  const bg = fakeAsset('ast_bg1', `bg-${unique()}`, project.id)
  const profile = fakeAsset('ast_pf1', `pf-${unique()}`, project.id)
  project.config.background.chatroom = { mode: 'image', color: '#ececef', imageAssetId: bg.id, focus: centerFocus() }
  project.config.profile = { mode: 'default', imageAssetId: profile.id, focus: centerFocus() }
  return { project, assets: new Map([[bg.id, bg], [profile.id, profile]]) }
}

export const uniqueTag = () => unique().slice(-6)

export async function eventually<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 20_000): Promise<T> {
  const until = Date.now() + timeoutMs
  for (;;) {
    const v = await fn().catch(() => null)
    if (v) return v
    if (Date.now() > until) throw new Error('Timed out waiting for condition')
    await new Promise((r) => setTimeout(r, 300))
  }
}

/** Reads a document with rules bypassed (emulator "owner" token), for asserting server-side cleanup. */
export async function adminDocExists(path: string): Promise<boolean> {
  const url = `http://127.0.0.1:8180/v1/projects/${EMULATOR_CONFIG.firebase.projectId}/databases/(default)/documents/${path}`
  const res = await fetch(url, { headers: { Authorization: 'Bearer owner' } })
  if (res.status === 404) return false
  if (!res.ok) throw new Error(`Emulator read failed: ${res.status}`)
  return true
}

/** Lists Storage object names under a prefix with rules bypassed, for asserting server-side cleanup. */
export async function adminListFiles(prefix: string): Promise<string[]> {
  const bucket = EMULATOR_CONFIG.firebase.storageBucket
  const url = `http://127.0.0.1:9199/v0/b/${bucket}/o?prefix=${encodeURIComponent(prefix)}`
  const res = await fetch(url, { headers: { Authorization: 'Bearer owner' } })
  if (!res.ok) throw new Error(`Emulator list failed: ${res.status}`)
  const body = (await res.json()) as { items?: { name: string }[] }
  return (body.items ?? []).map((i) => i.name)
}
