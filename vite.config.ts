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
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    coverage: {
      exclude: ['**/integrations/**', '**/providers/**', '**/errors/**', '**/core/**', '**/tests/**'],
      // Tests run under the Bun runtime, which does not expose the V8 coverage APIs, so use the source-instrumenting istanbul provider.
      provider: 'istanbul',
      reporter: ['lcov'],
      thresholds: {
        functions: 90,
        lines: 85,
      },
    },
    isolate: false,
    // Bun's loader mishandles zod's `import * as z; export { z }` re-export when the
    // dep is externalized, leaving `z` undefined. Inlining lets vite transform it.
    server: { deps: { inline: ['zod'] } },
    // All test files share a single Postgres container (see tests/global_setup.ts)
    // and the module-singleton `db`, so run them sequentially in one worker to
    // avoid cross-file interference on the shared database.
    fileParallelism: false,
    globalSetup: ['./tests/global_setup.ts'],
    include: ['tests/**/*.spec.ts'],
    setupFiles: ['./tests/env.ts', './tests/setup.ts'],
  },
})
