import { base, effect, options } from '@antoine-bouteiller/devkit'
import { recommended } from '@effect/tsgo/oxlint-presets'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [recommended, base, effect],
  options,
  ignorePatterns: ['oxlint.config.ts'],
  overrides: [
    {
      // Every test builds and provides its own layers at the point where it runs,
      // the HTTP transport is exercised by spying on the global fetch, and assertions read `expect(yield* effect)`.
      files: ['tests/**'],
      rules: { 'effecttsgo/global-fetch': 'off', 'effecttsgo/strict-effect-provide': 'off', 'effecttsgo/yield-in-call-argument': 'off' },
    },
    {
      // Reusable helpers are the only place a pipeable overload is expected.
      files: ['src/shared/**'],
      rules: { 'effecttsgo/missing-pipeable-signature': 'error' },
    },
  ],
  plugins: ['typescript', 'unicorn', 'import', 'node', 'effecttsgo'],
  rules: {
    'unicorn/filename-case': ['error', { cases: { snakeCase: true } }],
    'no-this-alias': 'off',
  },
})
