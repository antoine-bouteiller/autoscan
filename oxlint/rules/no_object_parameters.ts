import { defineRule, type ESTree, type SourceCode } from '@oxlint/plugins'

import { lexicalTypeParameterNames } from '../shared/lexical_type_parameters.ts'

type Parameter = ESTree.ParamPattern
type ParameterOwner =
  | ESTree.ArrowFunctionExpression
  | ESTree.Function
  | ESTree.TSCallSignatureDeclaration
  | ESTree.TSConstructSignatureDeclaration
  | ESTree.TSConstructorType
  | ESTree.TSFunctionType
  | ESTree.TSMethodSignature

const parameterAnnotation = (parameter: Parameter): ESTree.TSTypeAnnotation | undefined => {
  if (parameter.type === 'TSParameterProperty') {
    return parameterAnnotation(parameter.parameter)
  }
  if (parameter.type === 'RestElement') {
    return parameter.typeAnnotation ?? parameterAnnotation(parameter.argument)
  }
  if (parameter.type === 'AssignmentPattern') {
    return parameter.typeAnnotation ?? parameter.left.typeAnnotation ?? undefined
  }
  return parameter.typeAnnotation ?? undefined
}

const parameterName = (parameter: Parameter, sourceCode: SourceCode): string =>
  parameter.type === 'Identifier' ? parameter.name : sourceCode.getText(parameter).replace(/\s*:\s*object\s*$/u, '')

/** Ban the broad object type on function inputs, including local aliases to object. */
export const noObjectParametersRule = defineRule({
  createOnce(context) {
    const aliases = new Map<string, ESTree.TSType>()

    const resolvesToObject = (type: ESTree.TSType, shadowedAliases: ReadonlySet<string>, visited = new Set<string>()): boolean => {
      if (type.type === 'TSObjectKeyword') {
        return true
      }
      if (type.type === 'TSParenthesizedType') {
        return resolvesToObject(type.typeAnnotation, shadowedAliases, visited)
      }
      if (type.type === 'TSUnionType') {
        return type.types.some((member) => resolvesToObject(member, shadowedAliases, visited))
      }
      if (
        type.type !== 'TSTypeReference' ||
        type.typeName.type !== 'Identifier' ||
        (type.typeArguments?.params.length ?? 0) > 0 ||
        visited.has(type.typeName.name) ||
        shadowedAliases.has(type.typeName.name)
      ) {
        return false
      }
      const alias = aliases.get(type.typeName.name)
      if (alias === undefined) {
        return false
      }
      const nextVisited = new Set(visited)
      nextVisited.add(type.typeName.name)
      return resolvesToObject(alias, shadowedAliases, nextVisited)
    }

    const checkParameters = (node: ParameterOwner) => {
      const shadowedAliases = lexicalTypeParameterNames(node, context.sourceCode.visitorKeys)
      for (const parameter of node.params) {
        const annotation = parameterAnnotation(parameter)
        if (annotation === undefined || annotation === undefined) {
          continue
        }
        if (!resolvesToObject(annotation.typeAnnotation, shadowedAliases)) {
          continue
        }
        context.report({
          data: { parameter: parameterName(parameter, context.sourceCode) },
          messageId: 'objectParameter',
          node: annotation.typeAnnotation,
        })
      }
    }

    return {
      ArrowFunctionExpression: checkParameters,
      FunctionDeclaration: checkParameters,
      FunctionExpression: checkParameters,
      Program(node) {
        aliases.clear()
        for (const statement of node.body) {
          const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
          if (declaration?.type === 'TSTypeAliasDeclaration') {
            const typeParameters = declaration.typeParameters ?? undefined
            if (typeParameters === undefined) {
              aliases.set(declaration.id.name, declaration.typeAnnotation)
            }
          }
        }
      },
      TSCallSignatureDeclaration: checkParameters,
      TSConstructSignatureDeclaration: checkParameters,
      TSConstructorType: checkParameters,
      TSDeclareFunction: checkParameters,
      TSEmptyBodyFunctionExpression: checkParameters,
      TSFunctionType: checkParameters,
      TSMethodSignature: checkParameters,
    }
  },
  meta: {
    docs: {
      description: 'Disallow object function parameters; inputs must use an owner-provided type and be parsed at their boundary.',
    },
    messages: {
      objectParameter:
        'Parameter `{{parameter}}` uses the broad `object` type. Accept a named owner type; parse external input at its boundary before calling this function.',
    },
    type: 'problem',
  },
})
