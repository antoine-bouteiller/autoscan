import { RuleTester } from 'oxlint/plugins-dev'

import { noConditionalEmptyObjectSpreadRule } from './no_conditional_empty_object_spread.ts'

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } })
const error = { messageId: 'avoid' }

if (noConditionalEmptyObjectSpreadRule.meta?.fixable !== undefined) {
  throw new Error('The rule must not offer an unsafe semantics-changing fix.')
}

tester.run('autoscan/no-conditional-empty-object-spread', noConditionalEmptyObjectSpreadRule, {
  invalid: [
    {
      code: 'const result = { ...(value !== undefined ? { value } : {}) };',
      errors: [error],
    },
    {
      code: 'const result = { ...(condition ? {} : { value }) };',
      errors: [error],
    },
  ],
  valid: ['const result = { value };', 'const result = { ...values };', 'const result = condition ? { value } : {};'],
})
