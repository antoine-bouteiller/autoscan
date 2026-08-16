import { defineRule, type ESTree, type Scope, type SourceCode, type Variable } from '@oxlint/plugins'

const moduleMockMethods = new Set(['doMock', 'mock', 'unstable_mockModule'])

const resolveVariable = (sourceCode: SourceCode, identifier: ESTree.IdentifierReference): Variable | undefined => {
  let scope: Scope | undefined = sourceCode.getScope(identifier) ?? undefined
  while (scope !== undefined) {
    const variable = scope.set.get(identifier.name)
    if (variable !== undefined) {
      return variable
    }
    scope = scope.upper ?? undefined
  }
  return undefined
}

const importedName = (node: ESTree.Node): string | undefined => {
  if (node.type !== 'ImportSpecifier') {
    return undefined
  }
  return node.imported.type === 'Identifier' ? node.imported.name : node.imported.value
}

const isTestFrameworkObject = (sourceCode: SourceCode, expression: ESTree.Expression): expression is ESTree.IdentifierReference => {
  if (expression.type !== 'Identifier') {
    return false
  }
  if ((expression.name === 'vi' || expression.name === 'jest') && sourceCode.isGlobalReference(expression)) {
    return true
  }

  const variable = resolveVariable(sourceCode, expression)
  if (variable === undefined || variable.defs.length === 0) {
    return expression.name === 'vi' || expression.name === 'jest'
  }
  return variable.defs.some((definition) => {
    if (definition.type !== 'ImportBinding' || definition.parent?.type !== 'ImportDeclaration') {
      return false
    }
    const source = definition.parent.source.value
    const name = importedName(definition.node)
    return (source === 'vitest' && name === 'vi') || (source === '@jest/globals' && name === 'jest')
  })
}

const memberPropertyName = (callee: ESTree.Expression): string | undefined => {
  if (!('property' in callee) || !('computed' in callee)) {
    return undefined
  }
  const { property } = callee
  if (callee.computed) {
    return property.type === 'Literal' && typeof property.value === 'string' ? property.value : undefined
  }
  return property.type === 'Identifier' ? property.name : undefined
}

const moduleMockCall = (sourceCode: SourceCode, callee: ESTree.Expression): boolean => {
  if (!('object' in callee) || !isTestFrameworkObject(sourceCode, callee.object)) {
    return false
  }
  const method = memberPropertyName(callee)
  return method !== undefined && moduleMockMethods.has(method)
}

/** Ban test framework module mocking in favor of real dependency seams. */
export const noModuleMockingRule = defineRule({
  createOnce(context) {
    return {
      CallExpression(node) {
        if (node.callee.type === 'Super' || node.callee.type === 'V8IntrinsicExpression') {
          return
        }
        if (moduleMockCall(context.sourceCode, node.callee)) {
          context.report({ messageId: 'moduleMock', node })
        }
      },
    }
  },
  meta: {
    docs: {
      description: 'Disallow Vitest and Jest module mocking; tests must replace dependencies through real interfaces.',
    },
    messages: {
      moduleMock: 'Replace module mocking with dependency injection through a real interface, service layer, or faithful test implementation.',
    },
    type: 'problem',
  },
})
