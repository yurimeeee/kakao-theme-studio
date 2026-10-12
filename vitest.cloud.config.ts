import { defineConfig } from 'vitest/config'

// Integration tests against the Firebase Emulator Suite. Run through `pnpm test:cloud`,
// which starts the emulators (firebase emulators:exec) around this config.
export default defineConfig({
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.cloud.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
