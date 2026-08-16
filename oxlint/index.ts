import { eslintCompatPlugin } from '@oxlint/plugins'

import { noConditionalEmptyObjectSpreadRule } from './rules/no_conditional_empty_object_spread.ts'
import { noKnownValueWideningRule } from './rules/no_known_value_widening.ts'
import { noModuleMockingRule } from './rules/no_module_mocking.ts'
import { noObjectParametersRule } from './rules/no_object_parameters.ts'
import { noForbiddenTermInSymbolNamesRule } from './rules/no_shape_in_symbol_names.ts'
import { noUnknownTypeAliasesRule } from './rules/no_unknown_type_aliases.ts'
import { noUnsafeDictionaryTypeRule } from './rules/no_unsafe_dictionary_type.ts'

/** Generic Oxlint rules that reject low-evidence and low-signal implementation patterns. */
const autoscanPlugin = eslintCompatPlugin({
  meta: { name: 'autoscan' },
  rules: {
    'no-conditional-empty-object-spread': noConditionalEmptyObjectSpreadRule,
    'no-known-value-widening': noKnownValueWideningRule,
    'no-module-mocking': noModuleMockingRule,
    'no-object-parameters': noObjectParametersRule,
    'no-shape-in-symbol-names': noForbiddenTermInSymbolNamesRule,
    'no-unknown-type-aliases': noUnknownTypeAliasesRule,
    'no-unsafe-dictionary-type': noUnsafeDictionaryTypeRule,
  },
})

export default autoscanPlugin
