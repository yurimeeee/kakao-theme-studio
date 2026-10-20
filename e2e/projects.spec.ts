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
  // Only the template project: the untouched editor from freshApp is never stored.
  expect(await countRows(page, 'projects')).toBe(1)

  await page.getByRole('button', { name: '두 번째 삭제' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click()
  await expect(page.getByText('아직 만든 테마가 없어요.')).toBeVisible()
})

test('내 작업: 사본을 만들면 이미지까지 따로 보관되고 원본은 그대로다', async ({ page }) => {
  await freshApp(page)
  await page.getByRole('button', { name: '기본 프로필', exact: true }).click()
  await page.getByRole('radio', { name: '이미지' }).click()
  await page.getByLabel('기본 프로필 이미지 파일 선택').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: solidPng(20, 20, [1, 2, 3, 255]) })
  await saveWithName(page, '원본')
  const originalId = await currentProjectId(page)

  await page.getByRole('link', { name: '내 작업' }).click()
  await page.getByRole('button', { name: '원본 사본 만들기' }).click()
  await expect(page.getByText('사본을 만들었어요.')).toBeVisible()
  const items = page.getByTestId('project-item')
  await expect(items).toHaveCount(2)
  await expect(items.first()).toContainText('원본 사본')

  await page.getByRole('button', { name: '원본 사본 편집' }).click()
  await expect(page.getByTestId('theme-name')).toHaveText('원본 사본')
  const copyId = await currentProjectId(page)
  expect(copyId).not.toBe(originalId)
  expect(await countRows(page, 'assets', copyId)).toBe(1)
  await page.getByRole('button', { name: '기본 프로필', exact: true }).click()
  await expect(page.getByText('me.png')).toBeVisible()

  // Removing the image from the copy leaves the original's image alone.
  await page.getByRole('button', { name: '기본 프로필 이미지 제거' }).click()
  await waitSaved(page)
  expect(await countRows(page, 'assets', copyId)).toBe(0)
  expect(await countRows(page, 'assets', originalId)).toBe(1)
})

test('내 작업: 새 테마를 시작 템플릿으로 만든다', async ({ page }) => {
  await freshApp(page)
  await page.getByRole('link', { name: '내 작업' }).click()
  await page.getByRole('button', { name: '새 테마', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: '새 테마 만들기' })
  await expect(dialog.getByRole('list', { name: '시작 템플릿' }).getByRole('button')).toHaveCount(9)
  await dialog.getByRole('button', { name: '모노 다크' }).click()
  await expect(page).toHaveURL(/#\/editor\/lp_/)

  const panel = page.getByRole('complementary', { name: /속성/ })
  await page.getByRole('button', { name: '전체 색상' }).click()
  await expect(panel.getByLabel('주요 배경', { exact: true })).toHaveValue('#121212')
  await expect(panel.getByRole('list', { name: '추천 조합' }).getByRole('button', { name: '모노 다크' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '보내는 말풍선', exact: true }).click()
  await expect(panel.getByRole('radio', { name: '직각' })).toBeChecked()
  // Only the template project: the untouched editor from freshApp is never stored.
  expect(await countRows(page, 'projects')).toBe(1)
})
