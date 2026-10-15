import { expect, test } from '@playwright/test'
import { freshApp, newDevice, saveTheme, signIn, signUp, solidPng, uniqueTag, waitSaved } from '../e2e-cloud/helpers'

const account = { name: '스모크', email: `smoke-${uniqueTag()}@example.com`, password: `pw-${uniqueTag()}-${uniqueTag()}` }
test.afterAll(() => console.log(`SMOKE_ACCOUNT ${account.email} ${account.password}`))

test('실제 프로젝트: 저장 → 공개 공유 → 비로그인 조회·다운로드·갤러리 → 다른 기기 → 삭제', async ({ page, browser }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await freshApp(page)
  await page.getByRole('button', { name: '배경', exact: true }).click()
  const chatroom = page.locator('section').filter({ hasText: '대화방 배경' }).first()
  await chatroom.getByRole('radio', { name: '이미지' }).click()
  await page.getByLabel('대화방 배경 이미지 파일 선택').setInputFiles({ name: 'room.png', mimeType: 'image/png', buffer: solidPng(30, 60, [200, 40, 40, 255]) })
  await waitSaved(page)
  await signUp(page, account)

  const tag = uniqueTag()
  const name = `스모크 ${tag}`
  await saveTheme(page, name, '공개')
  await expect(page.getByText('클라우드에 저장했어요.')).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: '공유', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '테마 공유' })
  const link = dialog.getByLabel('공유 링크')
  await expect(link).toHaveValue(/#\/t\/[A-Za-z0-9]{22}$/, { timeout: 30_000 })
  const url = await link.inputValue()
  await page.keyboard.press('Escape')

  // Anonymous visitor: detail (Storage read through share rules + CORS), download, counter.
  const visitor = await newDevice(browser)
  const vErrors: string[] = []
  visitor.on('console', (m) => m.type() === 'error' && vErrors.push(m.text()))
  await visitor.goto(url)
  await expect(visitor.getByTestId('share-name')).toHaveText(name, { timeout: 30_000 })
  await visitor.getByRole('radio', { name: '대화' }).click()
  await expect
    .poll(() => visitor.getByTestId('theme-preview').locator('> div').first().evaluate((el) => getComputedStyle(el).backgroundImage), { timeout: 30_000 })
    .toContain('blob:')
  const downloadPromise = visitor.waitForEvent('download')
  const counted = visitor.waitForResponse(/recordDownload/, { timeout: 60_000 })
  await visitor.getByRole('button', { name: '.ktheme 다운로드' }).click()
  expect((await downloadPromise).suggestedFilename()).toBe(`${name}.ktheme`)
  expect(await (await counted).json()).toEqual({ result: { counted: true } })

  // Gallery search (composite index + searchTokens).
  await visitor.goto('/#/gallery')
  await visitor.getByRole('searchbox').fill(tag)
  const item = visitor.getByTestId('gallery-item').filter({ hasText: name })
  await expect(item).toBeVisible({ timeout: 30_000 })
  await expect(item).toContainText('다운로드 1회')
  await visitor.getByRole('radio', { name: '인기순' }).click().catch(() => {})
  expect(vErrors, 'visitor console errors').toEqual([])
  await visitor.context().close()

  // Second device opens it from the cloud with its image.
  const other = await newDevice(browser)
  await freshApp(other)
  await signIn(other, account)
  await other.goto('/#/projects/cloud')
  await other.getByRole('button', { name: `${name} 편집` }).click()
  await expect(other.getByTestId('theme-name')).toHaveText(name, { timeout: 30_000 })
  await other.getByRole('radio', { name: '대화' }).click()
  await expect
    .poll(() => other.getByTestId('theme-preview').locator('> div').first().evaluate((el) => getComputedStyle(el).backgroundImage), { timeout: 30_000 })
    .toContain('blob:')
  await other.context().close()

  // Delete from the cloud: the share link closes.
  await page.goto('/#/projects/cloud')
  await page.getByRole('button', { name: `${name} 삭제` }).click()
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: '삭제', exact: true }).click()
  await expect(page.getByText('클라우드에서 테마를 삭제했어요.')).toBeVisible({ timeout: 30_000 })
  const late = await newDevice(browser)
  await late.goto(url)
  await expect(late.getByText('이 테마를 볼 수 없어요.')).toBeVisible({ timeout: 30_000 })
  await late.context().close()
  expect(errors, 'owner console errors').toEqual([])
})
