import { expect, test } from '@playwright/test'
import { countRows, currentProjectId, freshApp, saveWithName, solidPng, waitSaved } from './helpers'

test('내 작업: 여러 프로젝트를 격리해서 수정·삭제한다', async ({ page }) => {
  await freshApp(page)
  await page.getByRole('button', { name: '전체 색상' }).click()
  await page.getByLabel('강조색', { exact: true }).fill('#aa0000')
  await saveWithName(page, '첫 번째')
  const firstId = await currentProjectId(page)
  await page.getByRole('button', { name: '기본 프로필' }).click()
  await page.getByRole('radio', { name: '이미지' }).click()
  await page.getByLabel('기본 프로필 이미지 파일 선택').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: solidPng(20, 20, [1, 2, 3, 255]) })
  await waitSaved(page)

  await page.goto('/#/editor/new')
  await expect(page.getByTestId('theme-name')).toHaveText('이름 없는 테마')
  await page.getByRole('button', { name: '전체 색상' }).click()
  await expect(page.getByLabel('강조색', { exact: true })).toHaveValue('#d9d9df')
  await page.getByLabel('강조색', { exact: true }).fill('#00aa00')
  await saveWithName(page, '두 번째')
  const secondId = await currentProjectId(page)
  expect(secondId).not.toBe(firstId)

  await page.getByRole('link', { name: '내 작업' }).click()
  const items = page.getByTestId('project-item')
  await expect(items).toHaveCount(2)
  await expect(items.first()).toContainText('두 번째')

  // Edit the first: its own values come back, untouched by the second.
  await page.getByRole('button', { name: '첫 번째 편집' }).click()
  await expect(page.getByTestId('theme-name')).toHaveText('첫 번째')
  await page.getByRole('button', { name: '전체 색상' }).click()
  await expect(page.getByLabel('강조색', { exact: true })).toHaveValue('#aa0000')
  expect(await currentProjectId(page)).toBe(firstId)

  // Delete the first: project + its assets disappear, the second stays.
  await page.getByRole('link', { name: '내 작업' }).click()
  await page.getByRole('button', { name: '첫 번째 삭제' }).click()
  const confirm = page.getByRole('dialog', { name: '테마를 삭제할까요?' })
  await expect(confirm.getByText('삭제한 작업은 되돌릴 수 없어요.')).toBeVisible()
  await confirm.getByRole('button', { name: '삭제', exact: true }).click()
  await expect(items).toHaveCount(1)
  await expect(items.first()).toContainText('두 번째')
  expect(await countRows(page, 'assets', firstId)).toBe(0)
  expect(await countRows(page, 'projects')).toBe(1)

  await page.getByRole('button', { name: '두 번째 삭제' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click()
  await expect(page.getByText('아직 만든 테마가 없어요.')).toBeVisible()
})
