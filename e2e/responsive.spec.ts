import { expect, test } from '@playwright/test'
import { freshApp } from './helpers'

for (const width of [320, 390, 768, 1280]) {
  test(`${width}px: 가로 넘침 없이 표시된다`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 860 })
    await freshApp(page)
    for (const hash of ['#/editor', '#/projects']) {
      await page.goto(`/${hash}`)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, hash).toBeLessThanOrEqual(0)
      await info.attach(`${width}${hash.replace(/\W/g, '-')}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    }
    const isDesktop = width >= 1024
    await page.goto('/#/editor')
    await expect(page.getByRole('complementary', { name: /속성/ })).toHaveCount(isDesktop ? 1 : 0)
  })
}

test('모바일 바텀시트: 열기·실시간 반영·완료·재열기 시 유지', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await freshApp(page)
  await page.getByRole('button', { name: '보내는 말풍선', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: '보내는 말풍선', exact: true })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: '완료' })).toBeFocused({ timeout: 2000 }).catch(() => undefined)
  await sheet.getByRole('radio', { name: '색상' }).click()
  await sheet.getByLabel('색상', { exact: true }).fill('#334455')
  await sheet.getByRole('radio', { name: '직각' }).click()
  await sheet.getByRole('button', { name: '완료' }).click()
  await expect(sheet).toBeHidden()

  await page.getByRole('button', { name: '보내는 말풍선', exact: true }).click()
  await expect(sheet.getByRole('radio', { name: '색상' })).toHaveAttribute('aria-checked', 'true')
  await expect(sheet.getByLabel('색상', { exact: true })).toHaveValue('#334455')
  await expect(sheet.getByRole('radio', { name: '직각' })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

  // Drag the handle down to dismiss.
  await page.getByRole('button', { name: '배경', exact: true }).click()
  const bgSheet = page.getByRole('dialog', { name: '배경' })
  await expect(bgSheet).toBeVisible()
  const handle = bgSheet.getByTestId('sheet-handle')
  await handle.hover() // waits until the slide-in animation has settled
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + 200, { steps: 8 })
  await page.mouse.up()
  await expect(bgSheet).toBeHidden()
})

test('아이콘 버튼은 한국어 접근성 이름과 툴팁을 가진다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 })
  await freshApp(page)
  const save = page.getByRole('button', { name: '저장', exact: true })
  await save.hover()
  await expect(page.getByRole('tooltip', { name: '저장' })).toBeVisible()
  await expect(page.getByRole('button', { name: '내보내기', exact: true })).toBeVisible()
})

test('모바일: 미리보기의 말풍선을 누르면 속성 시트가 열린다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await freshApp(page)
  await page.getByRole('radio', { name: '대화' }).click()
  await page.getByTestId('theme-preview').getByText('좋아!').click()
  await expect(page.getByRole('dialog', { name: '보내는 말풍선', exact: true })).toBeVisible()
})

test('모바일: 시트 위 미리보기에 편집이 바로 보이고, 눌러서 다른 요소로 바꾼다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await freshApp(page)
  await page.getByRole('radio', { name: '대화' }).click()
  await page.getByRole('button', { name: '보내는 말풍선', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: '보내는 말풍선', exact: true })
  const peek = sheet.getByTestId('sheet-peek')
  await expect(peek.getByTestId('theme-preview')).toBeVisible()
  // The whole phone fits above the sheet.
  const phone = (await peek.getByTestId('theme-preview').boundingBox())!
  const panelTop = (await sheet.getByTestId('sheet-handle').boundingBox())!.y
  expect(phone.y + phone.height).toBeLessThanOrEqual(panelTop)

  await sheet.getByRole('radio', { name: '색상' }).click()
  await sheet.getByLabel('색상', { exact: true }).fill('#ff7a59')
  await expect(peek.getByText('좋아!')).toHaveCSS('background-color', 'rgb(255, 122, 89)')

  await peek.getByText('오늘 하루는 어땠어?').click()
  await expect(page.getByRole('dialog', { name: '받는 말풍선', exact: true })).toBeVisible()
})

test('모바일 가로(낮은 화면): 시트만 열린다', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 390 })
  await freshApp(page)
  await page.getByRole('button', { name: '배경', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '배경' })).toBeVisible()
  await expect(page.getByTestId('sheet-peek')).toHaveCount(0)
})
