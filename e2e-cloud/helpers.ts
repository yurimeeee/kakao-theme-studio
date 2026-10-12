import { expect, type Browser, type Page, type Request } from '@playwright/test'

export { freshApp, solidPng, waitSaved } from '../e2e/helpers'

let n = 0
export const uniqueTag = () => `${Date.now().toString(36).slice(-5)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 4)}`

export interface Account {
  name: string
  email: string
  password: string
}

export const newAccount = (name = '테스터'): Account => ({ name, email: `e2e-${uniqueTag()}@example.test`, password: 'password-123' })

export async function signUp(page: Page, account: Account) {
  await page.getByRole('banner').getByRole('button', { name: '로그인', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '로그인' })
  await dialog.getByRole('button', { name: '이메일로 회원가입' }).click()
  await dialog.getByLabel('이름').fill(account.name)
  await dialog.getByLabel('이메일').fill(account.email)
  await dialog.getByLabel('비밀번호 (6자 이상)').fill(account.password)
  await dialog.getByRole('button', { name: '회원가입' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('banner').getByRole('button', { name: '내 계정' })).toBeVisible()
}

export async function signIn(page: Page, account: Account) {
  await page.getByRole('banner').getByRole('button', { name: '로그인', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '로그인' })
  await dialog.getByLabel('이메일').fill(account.email)
  await dialog.getByLabel('비밀번호', { exact: true }).fill(account.password)
  await dialog.getByRole('button', { name: '로그인', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('banner').getByRole('button', { name: '내 계정' })).toBeVisible()
}

export async function signOut(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: '내 계정' }).click()
  const dialog = page.getByRole('dialog', { name: '내 계정' })
  await dialog.getByRole('button', { name: '로그아웃' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('banner').getByRole('button', { name: '로그인', exact: true })).toBeVisible()
}

/** Save from the editor; when signed in this also saves to the cloud. */
export async function saveTheme(page: Page, name: string, visibility?: '비공개' | '링크 공개' | '공개') {
  await page.getByRole('button', { name: '저장', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '테마 저장' })
  await dialog.getByLabel('테마 이름').fill(name)
  if (visibility) await dialog.getByRole('radio', { name: visibility, exact: true }).click()
  await dialog.getByRole('button', { name: '저장', exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 20_000 })
}

/** Requests that write or read work data (Firestore / Storage / Functions emulators). */
export function trackCloudData(page: Page) {
  const hits: Request[] = []
  page.on('request', (req) => {
    if (/127\.0\.0\.1:(8180|9199|5001)/.test(req.url())) hits.push(req)
  })
  return {
    count: () => hits.length,
    writes: () => hits.filter((r) => r.method() !== 'GET' || /Write|Commit|upload/i.test(r.url())).length,
    reset: () => hits.splice(0),
  }
}

export async function newDevice(browser: Browser) {
  const context = await browser.newContext({ locale: 'ko-KR', permissions: ['clipboard-read', 'clipboard-write'] })
  return context.newPage()
}
