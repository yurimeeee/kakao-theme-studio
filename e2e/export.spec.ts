import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import JSZip from 'jszip'
import { freshApp, pngSize, solidPng } from './helpers'

test('내보내기: 검증된 구조의 .ktheme을 내려받는다', async ({ page }) => {
  await freshApp(page)
  // Mix: image background + color bubble + image bubble + tab icon.
  await page.getByRole('button', { name: '배경', exact: true }).click()
  const main = page.locator('section').filter({ hasText: '목록 배경' }).first()
  await main.getByRole('radio', { name: '이미지' }).click()
  await page.getByLabel('목록 배경 이미지 파일 선택').setInputFiles({ name: 'bg.png', mimeType: 'image/png', buffer: solidPng(90, 160, [240, 230, 220, 255]) })
  await expect(page.getByText('bg.png')).toBeVisible()

  await page.getByRole('button', { name: '받는 말풍선', exact: true }).click()
  await page.getByRole('radio', { name: '이미지' }).click()
  await page.getByLabel('말풍선 이미지 파일 선택').setInputFiles({ name: 'bubble.png', mimeType: 'image/png', buffer: solidPng(90, 75, [255, 255, 255, 255]) })
  await expect(page.getByText('bubble.png')).toBeVisible()

  await page.getByRole('button', { name: '보내는 말풍선', exact: true }).click()
  await page.getByRole('radio', { name: '색상' }).click()
  await page.getByRole('radio', { name: '캡슐' }).click()

  await page.getByRole('button', { name: '탭 아이콘' }).click()
  await page.getByRole('radio', { name: '이미지' }).click()
  await page.getByLabel('친구 탭 선택 전 파일 선택').setInputFiles({ name: 'tab.png', mimeType: 'image/png', buffer: solidPng(60, 60, [0, 0, 0, 255]) })
  await expect(page.getByText('tab.png')).toBeVisible()

  await page.getByRole('button', { name: '내보내기', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '테마 내보내기' })
  await dialog.getByLabel('테마 이름').fill('봄/여름 테마')
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: '내보내기', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('봄여름 테마.ktheme')
  const zip = await JSZip.loadAsync(await readFile((await download.path())!))

  const names = Object.keys(zip.files)
  expect(names[0]).toBe('KakaoTalkTheme.css')
  expect(names.filter((n) => /__MACOSX|\.DS_Store/.test(n))).toEqual([])
  const css = await zip.file('KakaoTalkTheme.css')!.async('string')
  expect(css).toContain("-kakaotalk-theme-name: '봄/여름 테마';")
  expect(css).toMatch(/-kakaotalk-theme-id: 'KTS_[0-9a-z]{16}';/)
  expect(css).not.toContain('border-radius')

  const refs = new Set(Array.from(css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/'([^'\s]+)\.png'/g), (m) => m[1]))
  for (const base of refs) {
    for (const scale of [2, 3]) {
      const file = zip.file(`Images/${base}@${scale}x.png`)
      expect(file, `${base}@${scale}x`).not.toBeNull()
    }
    const s2 = pngSize(await zip.file(`Images/${base}@2x.png`)!.async('uint8array'))
    const s3 = pngSize(await zip.file(`Images/${base}@3x.png`)!.async('uint8array'))
    expect(Math.abs(s2.width * 1.5 - s3.width), base).toBeLessThanOrEqual(2)
  }
  // Exact mapped sizes (pt × scale) for fixed resources.
  expect(pngSize(await zip.file('Images/mainBgImage@3x.png')!.async('uint8array'))).toEqual({ width: 1125, height: 2250 })
  expect(pngSize(await zip.file('Images/profileImg01@2x.png')!.async('uint8array'))).toEqual({ width: 200, height: 200 })
  expect(pngSize(await zip.file('Images/maintabIcoFriends@3x.png')!.async('uint8array'))).toEqual({ width: 120, height: 120 })
  expect(pngSize(await zip.file('Images/commonIcoTheme.png')!.async('uint8array'))).toEqual({ width: 200, height: 200 })
  // Image bubble used as @3x: 90×75px → 30×25pt, stretch at center.
  expect(pngSize(await zip.file('Images/chatroomBubbleReceive01@3x.png')!.async('uint8array'))).toEqual({ width: 90, height: 75 })
  expect(css).toContain("-ios-background-image: 'chatroomBubbleReceive01.png' 15px 12px;")
  // Capsule color bubble: generated 35pt image, stretch at 17pt.
  expect(css).toContain("-ios-background-image: 'chatroomBubbleSend01.png' 17px 17px;")
  expect(pngSize(await zip.file('Images/chatroomBubbleSend01@3x.png')!.async('uint8array'))).toEqual({ width: 105, height: 105 })
  expect(css).toContain("-ios-friends-normal-icon-image: 'maintabIcoFriends.png';")
  expect(css).not.toContain('-ios-chats-normal-icon-image')
})

test('내 작업 목록에서도 내보낼 수 있다', async ({ page }) => {
  await freshApp(page)
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await page.getByRole('dialog').getByLabel('테마 이름').fill('목록에서')
  await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click()
  await page.getByRole('link', { name: '내 작업' }).click()
  await page.getByRole('button', { name: '목록에서 내보내기' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '내보내기', exact: true }).click()
  expect((await downloadPromise).suggestedFilename()).toBe('목록에서.ktheme')
})
