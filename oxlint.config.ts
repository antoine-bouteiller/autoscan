import { defineConfig } from 'oxlint'

export default defineConfig({
  $schema: './node_modules/oxlint/configuration_schema.json',
  plugins: ['typescript', 'unicorn'],
  categories: {
    correctness: 'error',
    suspicious: 'error',
    perf: 'error',
    style: 'error',
  },
  env: {
    builtin: true,
    node: true,
    commonjs: true,
  },
  rules: {
    // Restriction
    'no-empty': 'error',
    'no-empty-function': 'error',
    'no-console': 'error',
    'no-unused-vars': 'error',
    'no-unused-expressions': 'error',
    'no-explicit-any': 'error',
    'no-non-null-assertion': 'error',
    'no-array-for-each': 'error',
    'prefer-modern-math-apis': 'error',
    'prefer-number-properties': 'error',

    // Pedantic
    'no-deprecated': 'error',

    // Style
    'unicorn/filename-case': [
      'error',
      {
        cases: {
          snakeCase: true,
        },
      },
    ],
    'prefer-default-export': 'off',
    'no-magic-numbers': 'off',
    'sort-imports': 'off',
    'sort-keys': 'off',
    'no-ternary': 'off',
    'id-length': 'off',
    'no-continue': 'off',
    'max-params': 'off',
    'no-await-in-loop': 'off',
    'init-declarations': 'off',
    'max-statements': 'off',
    'new-cap': 'off',
    'func-names': ['error', 'as-needed', { generators: 'never' }],
  },
  ignorePatterns: ['pnpm-lock.yaml'],
})
