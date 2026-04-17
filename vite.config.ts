import { defineConfig } from 'vite-plus'

export default defineConfig({
  fmt: {
    experimentalSortImports: {},
    printWidth: 150,
    semi: false,
    singleQuote: true,
    trailingComma: 'es5',
  },
  lint: {
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
    ignorePatterns: ['pnpm-lock.yaml', 'vite.config.ts'],
    options: { typeAware: true, typeCheck: true },
    plugins: ['typescript', 'unicorn', 'import', 'node'],
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
      complexity: ['error', 15],

      // Pedantic
      'no-deprecated': 'error',
      'no-negated-condition': 'error',
      'prefer-string-replace-all': 'error',

      // Suspicious
      'no-unassigned-import': 'off',

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
    },
  },
  pack: {
    copy: 'migrations',
    entry: 'src/index.ts',
    format: 'esm',
    platform: 'node',
  },
  resolve: {
    tsconfigPaths: true,
  },
  staged: {
    '*': 'vp check --fix',
    'pnpm-lock.yaml': 'bash scripts/update_nix_hash.sh',
  },
  test: {
    coverage: {
      exclude: ['**/integrations/**', '**/providers/**', '**/errors/**', '**/core/**', '**/tests/**'],
      provider: 'v8',
      reporter: ['lcov'],
      thresholds: {
        functions: 90,
        lines: 85,
      },
    },
    testTimeout: 10_000,
    isolate: false,
    include: ['tests/**/*.spec.ts'],
    setupFiles: ['./tests/env.ts', './tests/setup.ts'],
  },
})
