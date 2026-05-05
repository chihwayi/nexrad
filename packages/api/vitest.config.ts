import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: './src/test/globalSetup.ts',
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
})
