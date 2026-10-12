import { defineConfig, devices } from '@playwright/test'

const PORT = 4319

// Cloud (2차) flows against the Firebase Emulator Suite. Run via `pnpm e2e:cloud`, which
// starts the emulators (firebase emulators:exec) around this config.
export default defineConfig({
  testDir: 'e2e-cloud',
  timeout: 90_000,
  fullyParallel: true,
  workers: 3,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    locale: 'ko-KR',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite build --mode emulator --outDir dist-emulator && pnpm exec vite preview --mode emulator --outDir dist-emulator --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
