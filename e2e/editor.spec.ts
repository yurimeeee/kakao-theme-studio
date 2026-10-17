import { expect, test } from '@playwright/test'
import { countRows, currentProjectId, freshApp, saveWithName, solidPng, waitSaved } from './helpers'

test('색상 편집과 이미지가 새로고침 후 복원된다', async ({ page }) => {
  await freshApp(page)
  await page.getByRole('button', { name: '전체 색상' }).click()
  const accent = page.getByLabel('강조색', { exact: true })
  await accent.fill('#123456')
  await waitSaved(page)

  await page.getByRole('button', { name: '배경', exact: true }).click()
  const chatroom = page.getByRole('region').or(page.locator('section')).filter({ hasText: '대화방 배경' }).first()
  await chatroom.getByRole('radio', { name: '이미지' }).click()
  await page.getByLabel('대화방 배경 이미지 파일 선택').setInputFiles({ name: 'room.png', mimeType: 'image/png', buffer: solidPng(30, 60, [200, 40, 40, 255]) })
  await expect(page.getByText('room.png')).toBeVisible()
  await waitSaved(page)
  const id = await currentProjectId(page)
  expect(id).toMatch(/^lp_/)
  expect(await countRows(page, 'assets', id)).toBe(1)

  await page.reload()
  await expect(page.getByTestId('theme-preview')).toBeVisible()
  await page.getByRole('button', { name: '전체 색상' }).click()
  await expect(page.getByLabel('강조색', { exact: true })).toHaveValue('#123456')
  await page.getByRole('button', { name: '배경', exact: true }).click()
  await expect(page.getByText('room.png')).toBeVisible()
  await expect(page.getByText('30×60px')).toBeVisible()
  // The restored Blob is displayed in the chat room preview through a fresh object URL.
  await page.getByRole('radio', { name: '대화' }).click()
  const bg = await page.getByTestId('theme-preview').locator('> div').first().evaluate((el) => getComputedStyle(el).backgroundImage)
  expect(bg).toMatch(/^url\("blob:/)
})

test('지원하지 않는 파일과 빈 이름을 거부한다', async ({ page }) => {
  await freshApp(page)
  await page.getByRole('button', { name: '기본 프로필' }).click()
  await page.getByRole('radio', { name: '이미지' }).click()
  await page.getByLabel('기본 프로필 이미지 파일 선택').setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not an image') })
  await expect(page.getByRole('alert').filter({ hasText: '지원하지 않는 파일 형식이에요.' })).toBeVisible()

  await page.getByRole('button', { name: '저장', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '테마 저장' })
  await dialog.getByLabel('테마 이름').fill('   ')
  await dialog.getByRole('button', { name: '저장', exact: true }).click()
  await expect(dialog.getByText('테마 이름을 입력해 주세요.')).toBeVisible()
})

test('기본 프로필은 사진 없는 친구에게만 적용된다', async ({ page }) => {
  await freshApp(page)
  await page.getByRole('radio', { name: '친구' }).click()
  const preview = page.getByTestId('theme-preview')
  const defaults = await preview.getByTestId('default-profile').count()
  const photos = await preview.getByTestId('friend-photo').count()
  expect(defaults).toBeGreaterThan(0)
  expect(photos).toBeGreaterThan(0)
  for (const removed of ['소식', '광고', '업데이트한 프로필', '생일']) await expect(preview.getByText(removed)).toHaveCount(0)

  await page.getByRole('button', { name: '기본 프로필' }).click()
  await page.getByRole('radio', { name: '이미지' }).click()
  await page.getByLabel('기본 프로필 이미지 파일 선택').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: solidPng(40, 40, [10, 120, 200, 255]) })
  await expect(preview.getByTestId('default-profile').locator('img').first()).toBeVisible()
  expect(await preview.getByTestId('default-profile').locator('img').count()).toBe(defaults)
  expect(await preview.getByTestId('friend-photo').count()).toBe(photos)

  await page.getByRole('radio', { name: '채팅 목록' }).click()
  for (const name of ['라이언', '어피치', '무지', '튜브', '프로도', '네오']) await expect(preview.getByText(name, { exact: true })).toBeVisible()
  await expect(preview.getByText('안읽음')).toHaveCount(0)
})

test('암호 키패드는 개수만 표시하고 저장하지 않는다', async ({ page }) => {
  await freshApp(page)
  await page.getByRole('radio', { name: '암호 입력' }).click()
  const preview = page.getByTestId('theme-preview')
  await expect(preview.getByText('카카오톡 암호를 입력해 주세요.')).toBeVisible()
  await preview.getByRole('button', { name: '숫자 1' }).click()
  await preview.getByRole('button', { name: '숫자 2' }).click()
  await expect(preview.getByRole('status')).toHaveAttribute('aria-label', '암호 2자리 입력됨')
  await preview.getByRole('button', { name: '삭제' }).click()
  await expect(preview.getByRole('status')).toHaveAttribute('aria-label', '암호 1자리 입력됨')
  await preview.getByRole('button', { name: '취소' }).click()
  await expect(preview.getByRole('status')).toHaveAttribute('aria-label', '암호 0자리 입력됨')
  // Simulating the keypad is not an edit: nothing was written.
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'idle')
})

test('편집 중 서버로 요청을 보내지 않는다', async ({ page }) => {
  const external: string[] = []
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && !url.protocol.startsWith('blob') && !url.protocol.startsWith('data')) external.push(r.url())
    if (r.method() !== 'GET') external.push(`${r.method()} ${r.url()}`)
  })
  await freshApp(page)
  await page.getByRole('button', { name: '보내는 말풍선' }).click()
  await page.getByRole('radio', { name: '색상' }).click()
  await page.getByRole('radio', { name: '캡슐' }).click()
  await saveWithName(page, '네트워크 확인')
  expect(external).toEqual([])
})

test('실행 취소·다시 실행: 버튼과 단축키, 글자 입력 중에는 브라우저 기본 동작', async ({ page }) => {
  await freshApp(page)
  const undo = page.getByRole('button', { name: '실행 취소' })
  const redo = page.getByRole('button', { name: '다시 실행' })
  await expect(undo).toBeDisabled()

  await page.getByRole('button', { name: '전체 색상' }).click()
  const accent = page.getByLabel('강조색', { exact: true })
  const initial = await accent.inputValue()
  await accent.fill('#123456')
  await expect(undo).toBeEnabled()

  await undo.click()
  await expect(accent).toHaveValue(initial)
  await expect(redo).toBeEnabled()
  await redo.click()
  await expect(accent).toHaveValue('#123456')

  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('ControlOrMeta+z')
  await expect(accent).toHaveValue(initial)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(accent).toHaveValue('#123456')

  // Inside a text field the shortcut belongs to the field.
  await accent.focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(redo).toBeDisabled()
  await waitSaved(page)
})

test('미리보기를 누르면 해당 요소가 선택되고 화면은 그대로다', async ({ page }) => {
  await freshApp(page)
  await page.getByRole('radio', { name: '대화' }).click()
  const preview = page.getByTestId('theme-preview')
  const panel = page.getByRole('complementary', { name: /속성/ })

  await preview.getByText('오늘 하루는 어땠어?').click()
  await expect(panel).toHaveAccessibleName('받는 말풍선 속성')
  await preview.getByText('좋아!').click()
  await expect(panel).toHaveAccessibleName('보내는 말풍선 속성')
  await preview.getByText('메시지 입력').click()
  await expect(panel).toHaveAccessibleName('상단 · 입력창 속성')

  // Empty background: 배경 is selected but the 대화 screen stays.
  await preview.getByText('10월 11일 일요일').click()
  await expect(panel).toHaveAccessibleName('배경 속성')
  await expect(page.getByRole('radio', { name: '대화' })).toHaveAttribute('aria-checked', 'true')

  await page.getByRole('radio', { name: '친구' }).click()
  await preview.getByTestId('default-profile').first().click()
  await expect(panel).toHaveAccessibleName('기본 프로필 속성')
  await preview.getByRole('navigation', { name: '하단 탭 미리보기' }).click()
  await expect(panel).toHaveAccessibleName('탭 아이콘 속성')
})
