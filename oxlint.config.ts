import { recommended } from '@effect/tsgo/oxlint-presets'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [recommended],
  categories: {
    correctness: 'error',
    perf: 'error',
    style: 'error',
    suspicious: 'error',
  },
  env: {
    builtin: true,
    commonjs: true,
    node: true,
  },
  options: {
    typeAware: true,
    typeCheck: true,
  },
  ignorePatterns: ['oxlint.config.ts', 'oxfmt.config.ts'],
  overrides: [
    {
      // Every test builds and provides its own layers at the point where it runs.
      files: ['tests/**'],
      rules: { 'effecttsgo/strict-effect-provide': 'off' },
    },
    {
      // Reusable helpers are the only place a pipeable overload is expected.
      files: ['src/shared/**'],
      rules: { 'effecttsgo/missing-pipeable-signature': 'error' },
    },
  ],
  plugins: ['typescript', 'unicorn', 'import', 'node', 'effecttsgo'],
  rules: {
    // Pipeable overloads are for reusable helpers; app handlers take (client, message)/(request, reply).
    'effecttsgo/missing-pipeable-signature': 'off',

    // Restriction
    'no-empty': 'error',
    'no-empty-function': 'error',
    'no-console': 'error',
    'no-unused-vars': 'error',
    'no-unused-expressions': 'error',
    'no-explicit-any': 'error',
    'no-non-null-assertion': 'error',
    'no-this-alias': 'off',
    'no-underscore-dangle': ['error', { allow: ['_tag'] }],
    'no-array-for-each': 'error',
    'prefer-modern-math-apis': 'error',
    'prefer-number-properties': 'error',
    complexity: ['error', 15],

    // Pedantic
    'no-deprecated': 'error',
    'no-negated-condition': 'error',
    'prefer-string-replace-all': 'error',

    // Suspicious
    'no-unassigned-import': 'off',

    // Style
    'unicorn/filename-case': ['error', { cases: { snakeCase: true } }],
    'prefer-default-export': 'off',
    'no-magic-numbers': 'off',
    'sort-imports': 'off',
    'no-ternary': 'off',
    'no-continue': 'off',
    'no-await-in-loop': 'off',
    'init-declarations': 'off',
    'max-statements': 'off',
    'new-cap': 'off',
    'func-names': ['error', 'as-needed', { generators: 'never' }],
    'custom-error-definition': 'off',
    'no-nodejs-modules': 'off',
    'no-named-export': 'off',
    'group-exports': 'off',
    'consistent-type-specifier-style': ['error', 'prefer-inline'],
    'exports-last': 'off',

    // Off by design — default-on in standalone oxlint but not pertinent here:
    // Effect schemas nest calls inherently; fs.ts exposes deliberate safe*Sync wrappers.
    'unicorn/max-nested-calls': 'off',
    'node/no-sync': 'off',
  },
})
