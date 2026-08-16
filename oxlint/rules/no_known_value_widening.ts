import { defineRule, type ESTree, type Scope, type SourceCode, type Variable } from '@oxlint/plugins'

import {
  classifyWideningTarget,
  createTypeEnvironment,
  isKnownEvidenceExpression,
  type TypeEnvironment,
  type WideningTarget,
} from '../shared/dictionary_types.ts'

type FunctionExpression = ESTree.ArrowFunctionExpression | ESTree.Function

const unwrapExpression = (expression: ESTree.Expression): ESTree.Expression => {
  let current = expression
  while (
    current.type === 'ParenthesizedExpression' ||
    current.type === 'TSAsExpression' ||
    current.type === 'TSSatisfiesExpression' ||
    current.type === 'TSTypeAssertion' ||
    current.type === 'TSNonNullExpression'
  ) {
    current = current.expression
  }
  return current
}

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

const variableDeclarator = (variable: Variable): ESTree.VariableDeclarator | undefined => {
  if (variable.defs.length !== 1) {
    return undefined
  }
  const [definition] = variable.defs
  return definition?.type === 'Variable' && definition.node.type === 'VariableDeclarator' ? definition.node : undefined
}

const isStableConstVariable = (variable: Variable, declarator: ESTree.VariableDeclarator): boolean =>
  declarator.parent.type === 'VariableDeclaration' &&
  declarator.parent.kind === 'const' &&
  variable.references.every((reference) => reference.init || !reference.isWrite())

const hasKnownEvidence = (sourceCode: SourceCode, expression: ESTree.Expression, visitedVariables = new Set<Variable>()): boolean => {
  if (isKnownEvidenceExpression(expression)) {
    return true
  }
  const unwrapped = unwrapExpression(expression)
  if (unwrapped.type !== 'Identifier') {
    return false
  }
  const variable = resolveVariable(sourceCode, unwrapped)
  if (variable === undefined || visitedVariables.has(variable)) {
    return false
  }
  const declarator = variableDeclarator(variable)
  const initializer = declarator?.init ?? undefined
  if (declarator === undefined || initializer === undefined || !isStableConstVariable(variable, declarator)) {
    return false
  }
  visitedVariables.add(variable)
  return hasKnownEvidence(sourceCode, initializer, visitedVariables)
}

const annotationTarget = (annotation: ESTree.TSTypeAnnotation | undefined, environment: TypeEnvironment): WideningTarget | undefined =>
  annotation === undefined ? undefined : (classifyWideningTarget(annotation.typeAnnotation, environment) ?? undefined)

const enclosingFunction = (node: ESTree.Node): FunctionExpression | undefined => {
  let current: ESTree.Node | undefined = node.parent ?? undefined
  while (current !== undefined && current.type !== 'Program') {
    if (current.type === 'ArrowFunctionExpression' || current.type === 'FunctionDeclaration' || current.type === 'FunctionExpression') {
      return current
    }
    current = current.parent ?? undefined
  }
  return undefined
}

const sourceKeyName = (sourceCode: SourceCode, key: ESTree.PropertyKey): string => {
  if (key.type === 'Identifier' || key.type === 'PrivateIdentifier') {
    return key.name
  }
  if (key.type === 'Literal') {
    return String(key.value)
  }
  return sourceCode.getText(key)
}

const functionName = (sourceCode: SourceCode, owner: FunctionExpression | undefined): string => {
  if (owner === undefined) {
    return 'anonymous function'
  }
  const id = owner.id ?? undefined
  if (id !== undefined) {
    return id.name
  }
  const { parent } = owner
  if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') {
    return parent.id.name
  }
  if (parent.type === 'MethodDefinition') {
    return sourceKeyName(sourceCode, parent.key)
  }
  return 'anonymous function'
}

const isEmptyObjectExpression = (expression: ESTree.Expression): boolean => {
  const unwrapped = unwrapExpression(expression)
  return unwrapped.type === 'ObjectExpression' && unwrapped.properties.length === 0
}

const isDictionaryAccumulatorTarget = (destination: WideningTarget): boolean =>
  destination.kind === 'open dictionary' || destination.kind === 'generic container'

const hasParentAssertion = (node: ESTree.Node): boolean => node.parent?.type === 'TSAsExpression' || node.parent?.type === 'TSTypeAssertion'

/** Detect sound syntactic cases where a known value is explicitly widened and loses evidence. */
export const noKnownValueWideningRule = defineRule({
  createOnce(context) {
    let environment: TypeEnvironment | undefined = undefined

    const reportFlow = (expression: ESTree.Expression, destination: WideningTarget | undefined, subject: string) => {
      if (destination === undefined) {
        return
      }
      if (isDictionaryAccumulatorTarget(destination) && isEmptyObjectExpression(expression)) {
        return
      }
      if (!hasKnownEvidence(context.sourceCode, expression)) {
        return
      }
      context.report({
        data: { subject, target: destination.kind },
        messageId: 'widening',
        node: expression,
      })
    }

    const targetFromAnnotation = (annotation: ESTree.TSTypeAnnotation | undefined) =>
      environment === undefined ? undefined : annotationTarget(annotation, environment)

    return {
      AccessorProperty(node) {
        const value = node.value ?? undefined
        if (value === undefined) {
          return
        }
        reportFlow(value, targetFromAnnotation(node.typeAnnotation ?? undefined), `property \`${sourceKeyName(context.sourceCode, node.key)}\``)
      },
      ArrowFunctionExpression(node) {
        if (node.body.type === 'BlockStatement') {
          return
        }
        reportFlow(node.body, targetFromAnnotation(node.returnType ?? undefined), `return value of \`${functionName(context.sourceCode, node)}\``)
      },
      AssignmentExpression(node) {
        if (node.operator !== '=' || node.left.type !== 'Identifier') {
          return
        }
        const variable = resolveVariable(context.sourceCode, node.left)
        if (variable === undefined) {
          return
        }
        const declarator = variableDeclarator(variable)
        if (declarator === undefined || declarator.id.type !== 'Identifier') {
          return
        }
        reportFlow(node.right, targetFromAnnotation(declarator.id.typeAnnotation ?? undefined), `binding \`${declarator.id.name}\``)
      },
      Program(node) {
        environment = createTypeEnvironment(node)
      },
      PropertyDefinition(node) {
        const value = node.value ?? undefined
        if (value === undefined) {
          return
        }
        reportFlow(value, targetFromAnnotation(node.typeAnnotation ?? undefined), `property \`${sourceKeyName(context.sourceCode, node.key)}\``)
      },
      ReturnStatement(node) {
        const argument = node.argument ?? undefined
        if (argument === undefined) {
          return
        }
        const owner = enclosingFunction(node)
        reportFlow(argument, targetFromAnnotation(owner?.returnType ?? undefined), `return value of \`${functionName(context.sourceCode, owner)}\``)
      },
      TSAsExpression(node) {
        if (environment === undefined || hasParentAssertion(node)) {
          return
        }
        reportFlow(node.expression, classifyWideningTarget(node.typeAnnotation, environment) ?? undefined, 'assertion')
      },
      TSTypeAssertion(node) {
        if (environment === undefined || hasParentAssertion(node)) {
          return
        }
        reportFlow(node.expression, classifyWideningTarget(node.typeAnnotation, environment) ?? undefined, 'assertion')
      },
      VariableDeclarator(node) {
        const initializer = node.init ?? undefined
        if (initializer === undefined || node.id.type !== 'Identifier') {
          return
        }
        reportFlow(initializer, targetFromAnnotation(node.id.typeAnnotation ?? undefined), `binding \`${node.id.name}\``)
      },
    }
  },
  meta: {
    docs: {
      description:
        'Disallow syntactically established values from flowing into explicitly broad or anonymous target types that discard useful evidence.',
    },
    messages: {
      widening:
        'The explicit {{target}} type on {{subject}} discards known type evidence. Keep inference, validate with `satisfies`, or use a named owner contract.',
    },
    type: 'problem',
  },
})
