import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  build: {
    rolldownOptions: {
      output: {
        // Separate long-lived vendor chunks from app code for better caching.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'ui', test: /node_modules[\\/](@radix-ui|@floating-ui|lucide-react)[\\/]/ },
            { name: 'storage', test: /node_modules[\\/](dexie|zustand)[\\/]/ },
            // Firebase is loaded lazily in two steps: auth at startup, data SDKs on first cloud use.
            { name: 'firebase-auth', test: /node_modules[\\/](@firebase[\\/](app|auth|util|component|logger)|firebase[\\/](app|auth)|idb|tslib)[\\/]/ },
            { name: 'firebase-data', test: /node_modules[\\/](@firebase[\\/](firestore|storage|functions|webchannel-wrapper)|firebase[\\/](firestore|storage|functions))[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Emulator-backed tests run separately (pnpm test:cloud).
    exclude: ['src/**/*.cloud.test.ts', 'node_modules/**'],
    setupFiles: ['src/test/setup.ts'],
  },
})
