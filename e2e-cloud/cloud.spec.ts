import { expect, test } from '@playwright/test'
import { freshApp, newAccount, newDevice, saveTheme, signIn, signOut, signUp, solidPng, trackCloudData, uniqueTag, waitSaved } from './helpers'

test('로그인·편집만으로는 업로드하지 않고, 저장할 때만 클라우드에 저장한다 → 다른 기기에서 이어서 편집', async ({ page, browser }) => {
  const cloud = trackCloudData(page)
  await freshApp(page)

  // Edit while signed out, then sign in: nothing is uploaded.
  await page.getByRole('button', { name: '전체 색상' }).click()
  await page.getByLabel('강조색', { exact: true }).fill('#3355aa')
  await page.getByRole('button', { name: '배경', exact: true }).click()
  const chatroom = page.locator('section').filter({ hasText: '대화방 배경' }).first()
  await chatroom.getByRole('radio', { name: '이미지' }).click()
  await page.getByLabel('대화방 배경 이미지 파일 선택').setInputFiles({ name: 'room.png', mimeType: 'image/png', buffer: solidPng(30, 60, [200, 40, 40, 255]) })
  await waitSaved(page)
  const account = newAccount('클라우드')
  await signUp(page, account)
  await page.getByRole('button', { name: '전체 색상' }).click()
  await page.getByLabel('주요 글자', { exact: true }).fill('#111111')
  await waitSaved(page)
  await page.waitForTimeout(1500)
  expect(cloud.count(), 'editing / autosave / login must not touch Firestore or Storage').toBe(0)

  // Explicit 저장 → cloud.
  const name = `구름 ${uniqueTag()}`
  await saveTheme(page, name)
  await expect(page.getByText('클라우드에 저장했어요.')).toBeVisible()
  await expect(page.getByTestId('cloud-linked')).toBeVisible()
  expect(cloud.count()).toBeGreaterThan(0)

  await page.getByRole('link', { name: '내 작업' }).click()
  await page.getByRole('radio', { name: '클라우드' }).click()
  const item = page.getByTestId('cloud-item').filter({ hasText: name })
  await expect(item).toBeVisible()
  await expect(item.getByTestId('cloud-visibility')).toHaveText('비공개')

  // Another device: sign in, open from the cloud, settings and image come back.
  const other = await newDevice(browser)
  await freshApp(other)
  await signIn(other, account)
  await other.goto('/#/projects/cloud')
  await other.getByRole('button', { name: `${name} 편집` }).click()
  await expect(other.getByTestId('theme-name')).toHaveText(name)
  await other.getByRole('button', { name: '전체 색상' }).click()
  await expect(other.getByLabel('강조색', { exact: true })).toHaveValue('#3355aa')
  await other.getByRole('button', { name: '배경', exact: true }).click()
  await expect(other.getByText('room.png')).toBeVisible()
  await other.getByRole('radio', { name: '대화' }).click()
  const bg = await other.getByTestId('theme-preview').locator('> div').first().evaluate((el) => getComputedStyle(el).backgroundImage)
  expect(bg).toContain('blob:')
  await other.context().close()
})

test('공유: 링크 공개 → 비로그인 조회·다운로드, 공개 → 갤러리, 비공개 → 접근 차단', async ({ page, browser }) => {
  await freshApp(page)
  await signUp(page, newAccount('공유자'))
  // An image bubble: the shared preview must size it from the published manifest, not the editor.
  await page.getByRole('button', { name: '받는 말풍선' }).click()
  await page.getByRole('radio', { name: '이미지' }).click()
  await page.getByLabel('말풍선 이미지 파일 선택').setInputFiles({ name: 'bubble.png', mimeType: 'image/png', buffer: solidPng(90, 75, [255, 255, 255, 255]) })
  await expect(page.getByText('bubble.png')).toBeVisible()
  const tag = uniqueTag()
  const name = `공유 ${tag}`
  await saveTheme(page, name)

  await page.getByRole('button', { name: '공유', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '테마 공유' })
  await dialog.getByRole('radio', { name: '링크 공개' }).click()
  await dialog.getByRole('button', { name: '링크 공개로 바꾸기' }).click()
  await expect(page.getByText('링크 공개로 바꿨어요.', { exact: true })).toBeVisible()
  const link = dialog.getByLabel('공유 링크')
  await expect(link).toHaveValue(/#\/t\/[A-Za-z0-9]{22}$/)
  await dialog.getByRole('button', { name: '링크 복사' }).click()
  await expect(page.getByText('링크를 복사했어요.')).toBeVisible()
  const url = await link.inputValue()

  // Anonymous visitor in a separate browser.
  const visitor = await newDevice(browser)
  const visitorCloud = trackCloudData(visitor)
  await visitor.goto(url)
  await expect(visitor.getByTestId('share-name')).toHaveText(name)
  await expect(visitor.getByText('로그인 없이 다운로드할 수 있어요.')).toBeVisible()
  const imageBubbles = () =>
    visitor
      .getByTestId('theme-preview')
      .locator('div')
      .evaluateAll((els) => els.filter((el) => getComputedStyle(el).borderImageSource.startsWith('url("blob:')).length)
  await expect.poll(imageBubbles).toBeGreaterThan(0)
  await expect(visitor.getByRole('banner').getByRole('button', { name: '로그인', exact: true })).toBeVisible()
  const downloadPromise = visitor.waitForEvent('download')
  const counted = visitor.waitForResponse(/recordDownload/)
  await visitor.getByRole('button', { name: '.ktheme 다운로드' }).click()
  expect((await downloadPromise).suggestedFilename()).toBe(`${name}.ktheme`)
  expect(await (await counted).json()).toEqual({ result: { counted: true } })
  // Downloading creates nothing for the visitor (no local project, no cloud write besides the counter call).
  const projects = await visitor.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('kakao-theme-studio')
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains('projects')) return resolve(0)
          const req = db.transaction('projects').objectStore('projects').count()
          req.onsuccess = () => resolve(req.result)
        }
        open.onerror = () => resolve(0)
      }),
  )
  expect(projects).toBe(0)
  expect(visitorCloud.count()).toBeGreaterThan(0)

  // 링크 공개 is not in the gallery.
  await visitor.goto('/#/gallery')
  await visitor.getByRole('searchbox').fill(tag)
  await expect(visitor.getByText('검색 결과가 없어요.')).toBeVisible()

  // 공개 → listed.
  await dialog.getByRole('radio', { name: '공개', exact: true }).click()
  await dialog.getByRole('button', { name: '공개로 바꾸기' }).click()
  await expect(page.getByText('공개로 바꿨어요.', { exact: true })).toBeVisible()
  await expect(dialog.getByLabel('공유 링크')).toHaveValue(url)
  // Search tokens are indexed by a function right after publishing: retry the search.
  await expect(async () => {
    await visitor.reload()
    await visitor.getByRole('searchbox').fill(tag)
    await expect(visitor.getByTestId('gallery-item').filter({ hasText: name })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  await expect(visitor.getByTestId('gallery-item').filter({ hasText: name })).toContainText('다운로드 1회')

  // 비공개 → old link and gallery entry are gone.
  await dialog.getByRole('radio', { name: '비공개' }).click()
  await dialog.getByRole('button', { name: '비공개로 바꾸기' }).click()
  await expect(page.getByText('비공개로 바꿨어요.', { exact: true })).toBeVisible()
  await expect(dialog.getByLabel('공유 링크')).toHaveCount(0)
  await visitor.goto(url)
  await expect(visitor.getByText('이 테마를 볼 수 없어요.')).toBeVisible()
  await expect(visitor.getByText('삭제되었거나 공개가 종료된 테마예요.')).toBeVisible()
  await visitor.context().close()
})

test('로그아웃·계정 변경 시 다른 계정의 테마 사본을 보여 주지 않는다', async ({ page }) => {
  await freshApp(page)
  const a = newAccount('에이')
  await signUp(page, a)
  const name = `비밀 ${uniqueTag()}`
  await saveTheme(page, name)
  const editorUrl = page.url()

  await signOut(page)
  // The open copy is closed on sign-out and a fresh theme takes its place.
  await expect(page.getByTestId('theme-name')).toHaveText('이름 없는 테마')
  await page.getByRole('link', { name: '내 작업' }).click()
  await expect(page.getByTestId('project-item').filter({ hasText: name })).toHaveCount(0)
  await expect(page.getByText(/로그인한 계정에 연결된 테마 1개는 로그인하면 보여요/)).toBeVisible()
  await page.goto(editorUrl)
  await expect(page.getByText('이 테마를 볼 수 없어요.')).toBeVisible()

  // Another account on the same browser does not see it either.
  await signUp(page, newAccount('비'))
  await page.goto('/#/projects')
  await expect(page.getByTestId('project-item').filter({ hasText: name })).toHaveCount(0)
  await page.getByRole('radio', { name: '클라우드' }).click()
  await expect(page.getByText('클라우드에 저장한 테마가 없어요.')).toBeVisible()

  // The owner signs back in: it is there again.
  await signOut(page)
  await signIn(page, a)
  await page.goto('/#/projects')
  await expect(page.getByTestId('project-item').filter({ hasText: name })).toBeVisible()
})

test('두 기기에서 같은 테마를 저장하면 덮어쓰지 않고 충돌을 알린다', async ({ page, browser }) => {
  await freshApp(page)
  const account = newAccount('충돌')
  await signUp(page, account)
  const name = `충돌 ${uniqueTag()}`
  await saveTheme(page, name)

  const other = await newDevice(browser)
  await freshApp(other)
  await signIn(other, account)
  await other.goto('/#/projects/cloud')
  await other.getByRole('button', { name: `${name} 편집` }).click()
  await expect(other.getByTestId('theme-name')).toHaveText(name)
  await saveTheme(other, `${name} B`)
  await expect(other.getByText('클라우드에 저장했어요.')).toBeVisible()

  // First device is now behind: its save must not overwrite.
  await saveTheme(page, `${name} A`)
  const conflict = page.getByRole('dialog', { name: '다른 곳에서 먼저 저장됐어요' })
  await expect(conflict).toBeVisible()
  await conflict.getByRole('button', { name: '클라우드 버전 불러오기' }).click()
  await expect(conflict).toBeHidden()
  await expect(page.getByTestId('theme-name')).toHaveText(`${name} B`)
  await other.context().close()
})
