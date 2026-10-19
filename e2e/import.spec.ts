import { expect, test } from '@playwright/test'
import { freshApp, solidPng } from './helpers'

test('가져오기: 내보낸 .ktheme을 새 프로젝트로 열어 이어서 편집한다', async ({ page }) => {
  await freshApp(page)
  await page.getByRole('button', { name: '받는 말풍선', exact: true }).click()
  await page.getByRole('radio', { name: '이미지' }).click()
  await page.getByLabel('말풍선 이미지 파일 선택').setInputFiles({
    name: 'bubble.png',
    mimeType: 'image/png',
    // Not square, so it stays an image bubble even though it is one color.
    buffer: solidPng(90, 75, [255, 255, 255, 255]),
  })
  await expect(page.getByText('bubble.png')).toBeVisible()
  await page.getByRole('button', { name: '보내는 말풍선', exact: true }).click()
  await page.getByRole('radio', { name: '색상' }).click()
  await page.getByRole('radio', { name: '직각' }).click()

  await page.getByRole('button', { name: '내보내기', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '테마 내보내기' })
  await dialog.getByLabel('테마 이름').fill('왕복 테마')
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: '내보내기', exact: true }).click()
  const file = (await (await downloadPromise).path())!

  await page.getByRole('link', { name: '내 작업' }).click()
  await page.getByTestId('import-ktheme-input').setInputFiles(file)
  await expect(page).toHaveURL(/#\/editor\/lp_/)
  await expect(page.getByText("'왕복 테마' 테마를 가져왔어요.")).toBeVisible()

  await page.getByRole('button', { name: '받는 말풍선', exact: true }).click()
  await expect(page.getByRole('radio', { name: '이미지' })).toBeChecked()
  // A generated bubble comes back editable, not as a frozen image: its color equals 전체 색상, so 기본.
  await page.getByRole('button', { name: '보내는 말풍선', exact: true }).click()
  await expect(page.getByRole('radio', { name: '기본' })).toBeChecked()
  await expect(page.getByRole('radio', { name: '직각' })).toBeChecked()

  await page.getByRole('link', { name: '내 작업' }).click()
  await expect(page.getByTestId('project-item').filter({ hasText: '왕복 테마' })).toHaveCount(2)
})

test('가져오기: 테마 파일이 아니면 알려 준다', async ({ page }) => {
  await freshApp(page)
  await page.getByRole('link', { name: '내 작업' }).click()
  await page.getByTestId('import-ktheme-input').setInputFiles({ name: 'x.ktheme', mimeType: 'application/octet-stream', buffer: Buffer.from('hello') })
  await expect(page.getByText('.ktheme 파일이 아니에요.', { exact: false })).toBeVisible()
})
