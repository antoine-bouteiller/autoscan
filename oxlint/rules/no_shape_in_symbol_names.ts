import { defineRule, type ESTree } from '@oxlint/plugins'

const FORBIDDEN_SYMBOL_NAME = 'shape'

const containsForbiddenSymbolName = (name: string): boolean => name.toLowerCase().includes(FORBIDDEN_SYMBOL_NAME)

/** Ban the case-insensitive substring "shape" in every JavaScript and TypeScript symbol name. */
export const noForbiddenTermInSymbolNamesRule = defineRule({
  createOnce(context) {
    const reportForbiddenSymbolName = (node: ESTree.Node & { name: string }) => {
      if (!containsForbiddenSymbolName(node.name)) {
        return
      }
      context.report({
        data: { name: node.name },
        messageId: 'forbiddenSymbolName',
        node,
      })
    }

    return {
      Identifier: reportForbiddenSymbolName,
      JSXIdentifier: reportForbiddenSymbolName,
      PrivateIdentifier: reportForbiddenSymbolName,
    }
  },
  meta: {
    docs: {
      description: 'Disallow the case-insensitive substring "shape" in JavaScript, TypeScript, private, and JSX symbol names.',
    },
    messages: {
      forbiddenSymbolName: 'Rename symbol "{{name}}" for its domain role; "shape" describes structure rather than ownership.',
    },
    type: 'problem',
  },
})
