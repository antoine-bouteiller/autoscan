import { defineConfig } from 'vite-plus'

export default defineConfig({
  lint: {
    options: { typeAware: true, typeCheck: true },
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
      'no-empty-pattern': 'off',
      'new-cap': 'off',
      'func-names': ['error', 'as-needed', { generators: 'never' }],
    },
    ignorePatterns: ['pnpm-lock.yaml'],
  },
  fmt: {
    trailingComma: 'es5',
    semi: false,
    singleQuote: true,
    printWidth: 150,
    experimentalSortImports: {},
  },
  test: {
    include: ['tests/**/*.spec.ts'],
    setupFiles: ['./tests/env.ts', './tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov'],
      exclude: ['**/integrations/**'],
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  staged: {
    'pnpm-lock.yaml': 'bash scripts/update_nix_hash.sh',
    '*': 'vp check --fix',
  },
  pack: {
    entry: 'src/index.ts',
    format: 'esm',
    platform: 'node',
    copy: 'migrations',
  },
})
