import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { freshApp, saveWithName, solidPng } from './helpers'

/** 내 작업 with an empty IndexedDB. */
async function emptyProjects(page: Page) {
  await page.goto('/')
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('kakao-theme-studio')
        req.onsuccess = req.onerror = req.onblocked = () => resolve()
      }),
  )
  await page.goto('/#/projects')
  await page.reload()
  await expect(page.getByText('아직 만든 테마가 없어요.')).toBeVisible()
}

/** Drags a file onto the page and drops it, the way the browser does with a file from Finder. */
async function dropFile(page: Page, name: string, bytes: Buffer) {
  const data = await page.evaluateHandle(
    ({ name, b64 }) => {
      const dt = new DataTransfer()
      dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name))
      return dt
    },
    { name, b64: bytes.toString('base64') },
  )
  await page.dispatchEvent('main', 'dragenter', { dataTransfer: data })
  await expect(page.getByTestId('ktheme-drop-overlay')).toBeVisible()
  await page.dispatchEvent('main', 'drop', { dataTransfer: data })
  await expect(page.getByTestId('ktheme-drop-overlay')).toBeHidden()
}

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
  // The generated silhouette and theme icon are recognized and stay linked to the colors.
  await page.getByRole('button', { name: '기본 프로필', exact: true }).click()
  await expect(page.getByRole('radiogroup', { name: '기본 프로필 방식' }).getByRole('radio', { name: '기본' })).toBeChecked()
  await page.getByRole('button', { name: '테마 아이콘', exact: true }).click()
  await expect(page.getByRole('radiogroup', { name: '테마 아이콘 방식' }).getByRole('radio', { name: '기본' })).toBeChecked()

  await page.getByRole('link', { name: '내 작업' }).click()
  await expect(page.getByTestId('project-item').filter({ hasText: '왕복 테마' })).toHaveCount(2)

  // Dropping the same file works too.
  await dropFile(page, '왕복 테마.ktheme', await readFile(file))
  await expect(page).toHaveURL(/#\/editor\/lp_/)
})

test('가져오기: 빈 내 작업에서 파일을 끌어다 놓아 가져온다', async ({ page }) => {
  await emptyProjects(page)
  // The empty state offers it next to 새 테마 만들기.
  await expect(page.getByRole('button', { name: '가져오기' })).toHaveCount(2)

  const zip = new JSZip()
  zip.file('KakaoTalkTheme.css', "ManifestStyle { -kakaotalk-theme-name: '끌어온 테마'; }\nMainViewStyle-Primary { background-color: #203040; -ios-text-color: #f0f0f0; }")
  await dropFile(page, '끌어온 테마.ktheme', await zip.generateAsync({ type: 'nodebuffer' }))
  await expect(page).toHaveURL(/#\/editor\/lp_/)
  await expect(page.getByRole('heading', { name: '끌어온 테마' })).toBeVisible()
})

test('가져오기: 테마 파일이 아니면 알려 준다', async ({ page }) => {
  await emptyProjects(page)
  await page.getByTestId('import-ktheme-input').setInputFiles({ name: 'x.ktheme', mimeType: 'application/octet-stream', buffer: Buffer.from('hello') })
  await expect(page.getByText('테마 파일(.ktheme)이나 백업 파일(.ktproject)이 아니에요.')).toBeVisible()
  await expect(page).toHaveURL(/#\/projects$/)
})

test('백업: 백업 파일로 저장했다가 삭제 후 그대로 되살린다', async ({ page }) => {
  await freshApp(page)
  await page.getByRole('button', { name: '기본 프로필', exact: true }).click()
  await page.getByRole('radio', { name: '이미지' }).click()
  await page.getByLabel('기본 프로필 이미지 파일 선택').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: solidPng(40, 40, [10, 20, 30, 255]) })
  await expect(page.getByText('me.png')).toBeVisible()
  await saveWithName(page, '백업할 테마')

  await page.getByRole('link', { name: '내 작업' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '백업할 테마 백업 파일 저장' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('백업할 테마.ktproject')
  const file = (await download.path())!
  await expect(page.getByText('백업 파일을 내려받았어요.', { exact: false })).toBeVisible()

  await page.getByRole('button', { name: '백업할 테마 삭제' }).click()
  await page.getByRole('dialog', { name: '테마를 삭제할까요?' }).getByRole('button', { name: '삭제' }).click()
  await expect(page.getByText('아직 만든 테마가 없어요.')).toBeVisible()

  await page.getByTestId('import-ktheme-input').setInputFiles(file)
  await expect(page).toHaveURL(/#\/editor\/lp_/)
  await expect(page.getByText("'백업할 테마' 백업을 불러왔어요.")).toBeVisible()
  await expect(page.getByTestId('theme-name')).toHaveText('백업할 테마')
  // The original upload comes back, not a rendered copy.
  await page.getByRole('button', { name: '기본 프로필', exact: true }).click()
  await expect(page.getByText('me.png')).toBeVisible()
})
