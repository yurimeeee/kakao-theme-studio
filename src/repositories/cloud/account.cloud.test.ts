import { signInWithEmailAndPassword } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { describe, expect, it } from 'vitest'
import { adminDocExists, adminListFiles, anonymousClient, eventually, projectWithImages, signedInClient } from '@/test/cloudEmulator'
import { CloudThemeRepository } from './cloudThemes'
import { ShareRepository } from './shares'

const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })

describe('deleteAccount (emulator)', () => {
  it('removes the account, its themes, revisions, shares, files and profile', async () => {
    const owner = await signedInClient('탈퇴자')
    const themes = new CloudThemeRepository(owner)
    const { project, assets } = projectWithImages('지울 테마')
    const saved = await themes.save({ project, assets, thumbnail: png })
    const { shareId } = await new ShareRepository(owner, themes).setVisibility(saved.themeId, 'public')
    const email = owner.auth.currentUser!.email!
    expect(await adminDocExists(`users/${owner.uid}`)).toBe(true)
    expect((await adminListFiles(`users/${owner.uid}/`)).length).toBeGreaterThan(0)

    await httpsCallable(owner.functions, 'deleteAccount')()

    // Public access ends with the call itself.
    expect(await adminDocExists(`shares/${shareId}`)).toBe(false)
    expect(await adminDocExists(`themes/${saved.themeId}`)).toBe(false)
    expect(await adminDocExists(`themes/${saved.themeId}/revisions/${saved.revisionId}`)).toBe(false)
    expect(await adminDocExists(`users/${owner.uid}`)).toBe(false)
    expect(await adminListFiles(`users/${owner.uid}/`)).toEqual([])
    await eventually(async () => (await adminListFiles(`shares/${shareId}/`)).length === 0)
    await expect(signInWithEmailAndPassword(owner.auth, email, 'password-123')).rejects.toMatchObject({
      code: expect.stringMatching(/user-not-found|invalid-credential/),
    })
  })

  it('leaves other accounts alone and refuses anonymous callers', async () => {
    const other = await signedInClient('남는 사람')
    const otherThemes = new CloudThemeRepository(other)
    const kept = await otherThemes.save({ ...projectWithImages('남는 테마'), thumbnail: png })
    const leaving = await signedInClient('떠나는 사람')
    await httpsCallable(leaving.functions, 'deleteAccount')()
    expect(await otherThemes.get(kept.themeId)).not.toBeNull()

    await expect(httpsCallable(anonymousClient().functions, 'deleteAccount')()).rejects.toMatchObject({
      code: 'functions/unauthenticated',
    })
  })
})
