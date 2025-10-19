import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    setupFiles: ['tests/config.ts'],
    slowTestThreshold: 1000,
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
