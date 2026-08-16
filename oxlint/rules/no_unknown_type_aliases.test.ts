import { RuleTester } from 'oxlint/plugins-dev'

import { noUnknownTypeAliasesRule } from './no_unknown_type_aliases.ts'

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } })
const error = { messageId: 'unknownAlias' }

tester.run('autoscan/no-unknown-type-aliases', noUnknownTypeAliasesRule, {
  invalid: [
    { code: 'type Alias = unknown;', errors: [error] },
    { code: 'type Current = unknown;', errors: [error] },
    { code: 'type UnknownValue = unknown; type Alias = UnknownValue;', errors: [error, error] },
  ],
  valid: ['type User = { readonly id: string };', 'type Alias = string; type UserId = Alias;'],
})
