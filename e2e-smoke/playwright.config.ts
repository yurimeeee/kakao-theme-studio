import { defineConfig, devices } from '@playwright/test'

/**
 * Smoke test against the real Firebase project.
 * - default: local production build (.env.production.local) on :4173
 * - SMOKE_BASE_URL=https://… : an already deployed site (no local server)
 */
const deployed = process.env.SMOKE_BASE_URL
const baseURL = deployed ?? 'http://localhost:4173'

export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL, locale: 'ko-KR', permissions: ['clipboard-read', 'clipboard-write'], trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: deployed
    ? undefined
    : {
        command: 'pnpm exec vite build --outDir dist-smoke && pnpm exec vite preview --outDir dist-smoke --port 4173 --strictPort',
        url: baseURL,
        cwd: '..',
        reuseExistingServer: false,
        timeout: 180_000,
      },
})
