import { defineConfig } from 'oxlint'

export default defineConfig({
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
  plugins: ['typescript', 'unicorn', 'import', 'node', 'effecttsgo'],
  rules: {
    'effecttsgo/outdated-api': 'error',
    'effecttsgo/floating-effect': 'error',
    'effecttsgo/missing-effect-context': 'error',
    'effecttsgo/missing-effect-error': 'error',
    'effecttsgo/duplicate-package': 'error',
    // Provider boundaries intentionally accept unknown failures.
    'effecttsgo/any-unknown-in-error-context': 'off',
    'effecttsgo/catch-to-or-else-succeed': 'error',
    'effecttsgo/deterministic-keys': 'off',
    'effecttsgo/effect-succeed-with-void': 'off',
    // Application-facing Effects are eager by design.
    'effecttsgo/lazy-effect': 'off',
    // Internal helpers do not need pipeable overloads.
    'effecttsgo/missing-pipeable-signature': 'off',
    'effecttsgo/missed-pipeable-opportunity': 'off',
    // Boolean narrowing follows the project's TypeScript style.
    'effecttsgo/strict-boolean-expressions': 'off',
    // Root entry-point composition intentionally provides partial requirements.
    'effecttsgo/strict-effect-provide': 'off',

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
