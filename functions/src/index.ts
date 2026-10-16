import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger, setGlobalOptions } from 'firebase-functions'
import { region as regionV1 } from 'firebase-functions/v1'
import { defineSecret, defineString } from 'firebase-functions/params'
import { onDocumentDeleted, onDocumentWritten } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { isRecentLogin } from './account.js'
import { clientIp, downloadActor, downloadMarkId, MARK_TTL_MS, SHARE_ID_PATTERN, utcDay } from './downloads.js'
import { exchangeKakaoCode, isAllowedRedirect, KakaoAuthError, kakaoUid, type FetchLike } from './kakao.js'
import { sameTokens, searchTokens } from './search.js'

initializeApp()
setGlobalOptions({ region: 'asia-northeast3', maxInstances: 10 })

/** Kakao REST API key (OAuth client_id). Public, but configured server-side too. */
const KAKAO_REST_API_KEY = defineString('KAKAO_REST_API_KEY', { default: '' })
/** Comma-separated exact redirect URIs registered in Kakao Developers. */
const KAKAO_REDIRECT_URIS = defineString('KAKAO_REDIRECT_URIS', { default: '' })
/** Kakao client secret (Kakao Developers → 보안). Secret Manager only. */
const KAKAO_CLIENT_SECRET = defineSecret('KAKAO_CLIENT_SECRET')
/** Salt for hashing client IPs in download de-duplication. */
const DOWNLOAD_SALT = defineSecret('DOWNLOAD_SALT')

/**
 * 카카오 로그인: authorization code → Kakao token (server) → Kakao user id →
 * Firebase custom token for uid `kakao:{id}`. The browser verifies `state` before calling.
 */
export const kakaoSignIn = onCall({ secrets: [KAKAO_CLIENT_SECRET], invoker: 'public' }, async (request) => {
  const clientId = KAKAO_REST_API_KEY.value()
  const allowList = KAKAO_REDIRECT_URIS.value()
  if (!clientId || !allowList) throw new HttpsError('failed-precondition', 'kakao-not-configured')

  const { code, redirectUri } = (request.data ?? {}) as { code?: unknown; redirectUri?: unknown }
  if (typeof code !== 'string' || typeof redirectUri !== 'string') throw new HttpsError('invalid-argument', 'code and redirectUri are required')
  if (!isAllowedRedirect(redirectUri, allowList)) throw new HttpsError('invalid-argument', 'redirect-not-allowed')

  try {
    const profile = await exchangeKakaoCode({
      code,
      redirectUri,
      clientId,
      clientSecret: KAKAO_CLIENT_SECRET.value() ?? '',
      fetch: fetch as unknown as FetchLike,
    })
    const uid = kakaoUid(profile.kakaoId)
    const auth = getAuth()
    const update = {
      displayName: profile.nickname ?? undefined,
      photoURL: profile.photoURL ?? undefined,
    }
    try {
      await auth.updateUser(uid, update)
    } catch (error) {
      if ((error as { code?: string }).code !== 'auth/user-not-found') throw error
      await auth.createUser({ uid, ...update })
    }
    const token = await auth.createCustomToken(uid, { provider: 'kakao' })
    return { token }
  } catch (error) {
    if (error instanceof KakaoAuthError) {
      logger.warn('kakaoSignIn rejected', { code: error.code })
      if (error.code === 'kakao-unavailable') throw new HttpsError('unavailable', error.code)
      throw new HttpsError('permission-denied', error.code)
    }
    logger.error('kakaoSignIn failed', error)
    throw new HttpsError('internal', 'kakao-sign-in-failed')
  }
})

/** Counts one download of a ready share (de-duplicated, see downloads.ts). */
export const recordDownload = onCall({ secrets: [DOWNLOAD_SALT], invoker: 'public' }, async (request) => {
  const shareId = (request.data as { shareId?: unknown } | null)?.shareId
  if (typeof shareId !== 'string' || !SHARE_ID_PATTERN.test(shareId)) throw new HttpsError('invalid-argument', 'shareId')

  const uid = request.auth?.uid ?? null
  const ip = clientIp(request.rawRequest.headers, request.rawRequest.ip)
  const actor = downloadActor(uid, ip, DOWNLOAD_SALT.value() || 'kts-dev-salt')
  const now = Date.now()
  const db = getFirestore()
  const shareRef = db.collection('shares').doc(shareId)
  const markRef = db.collection('downloadMarks').doc(downloadMarkId(shareId, actor, utcDay(now)))

  const counted = await db.runTransaction(async (tx) => {
    const [share, mark] = await Promise.all([tx.get(shareRef), tx.get(markRef)])
    if (!share.exists || share.get('status') !== 'ready') throw new HttpsError('not-found', 'share')
    if (uid && share.get('ownerId') === uid) return false
    if (mark.exists) return false
    tx.create(markRef, { shareId, createdAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + MARK_TTL_MS) })
    tx.update(shareRef, { downloadCount: FieldValue.increment(1) })
    return true
  })
  return { counted }
})

/** Deleting a theme: remove its files, revisions and every share that points at it. Retried on failure. */
export const onThemeDeleted = onDocumentDeleted({ document: 'themes/{themeId}', retry: true }, async (event) => {
  const themeId = event.params.themeId
  const ownerId = event.data?.get('ownerId')
  const db = getFirestore()
  if (typeof ownerId === 'string' && ownerId) {
    await getStorage().bucket().deleteFiles({ prefix: `users/${ownerId}/themes/${themeId}/` })
  }
  await db.recursiveDelete(db.collection('themes').doc(themeId).collection('revisions'))
  const shares = await db.collection('shares').where('themeId', '==', themeId).get()
  await Promise.all(shares.docs.map((d) => d.ref.delete()))
})

/** A share document is gone (비공개 전환, 링크 변경, 삭제): remove its published copies. Retried on failure. */
export const onShareDeleted = onDocumentDeleted({ document: 'shares/{shareId}', retry: true }, async (event) => {
  await getStorage().bucket().deleteFiles({ prefix: `shares/${event.params.shareId}/` })
})

/**
 * Keeps a share's gallery search tokens derived from its name. Clients cannot write
 * searchTokens (rules); this write re-triggers the function once and then stops because the
 * tokens already match. An older event finishing last is corrected by the event its own write causes.
 */
export const onShareWritten = onDocumentWritten({ document: 'shares/{shareId}', retry: true }, async (event) => {
  const after = event.data?.after
  if (!after?.exists) return
  const name = after.get('name')
  const tokens = typeof name === 'string' ? searchTokens(name) : []
  if (sameTokens(after.get('searchTokens'), tokens)) return
  try {
    await after.ref.update({ searchTokens: tokens })
  } catch (error) {
    // Deleted in the meantime (비공개 전환 등): nothing to index.
    if ((error as { code?: number }).code === 5) return
    throw error
  }
})

/**
 * Removes everything an account owns: shares first (public access ends at once), then
 * themes with their revisions, the owner's Storage folder and the profile document.
 * Idempotent — runs from deleteAccount and again from the Auth deletion trigger.
 */
async function purgeUserData(uid: string): Promise<void> {
  const db = getFirestore()
  const shares = await db.collection('shares').where('ownerId', '==', uid).get()
  await Promise.all(shares.docs.map((d) => d.ref.delete()))
  const themes = await db.collection('themes').where('ownerId', '==', uid).get()
  for (const theme of themes.docs) await db.recursiveDelete(theme.ref)
  await getStorage().bucket().deleteFiles({ prefix: `users/${uid}/` })
  await db.collection('users').doc(uid).delete()
}

/** 회원 탈퇴: deletes the caller's data, then the Auth account. Requires a recent sign-in. */
export const deleteAccount = onCall({ invoker: 'public' }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'sign-in-required')
  if (!isRecentLogin(request.auth?.token.auth_time, Date.now())) throw new HttpsError('failed-precondition', 'recent-login-required')
  try {
    await purgeUserData(uid)
    await getAuth().deleteUser(uid)
  } catch (error) {
    if ((error as { code?: string }).code === 'auth/user-not-found') return { deleted: true }
    logger.error('deleteAccount failed', error)
    throw new HttpsError('internal', 'delete-account-failed')
  }
  return { deleted: true }
})

/** An account removed elsewhere (Firebase console, Admin SDK): clean up its data too. */
export const onUserDeleted = regionV1('asia-northeast3')
  .runWith({ failurePolicy: true })
  .auth.user()
  .onDelete(async (user) => {
    await purgeUserData(user.uid)
  })
