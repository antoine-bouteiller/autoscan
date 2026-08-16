import { defineRule, type ESTree } from '@oxlint/plugins'

import { classifyUnsafeDictionary, classifyUnsafeDictionaryValue, createTypeEnvironment, type TypeEnvironment } from '../shared/dictionary_types.ts'

const typeNodeKinds: ReadonlySet<string> = new Set([
  'JSDocNonNullableType',
  'JSDocNullableType',
  'JSDocUnknownType',
  'TSAnyKeyword',
  'TSArrayType',
  'TSBigIntKeyword',
  'TSBooleanKeyword',
  'TSConditionalType',
  'TSConstructorType',
  'TSFunctionType',
  'TSImportType',
  'TSIndexedAccessType',
  'TSInferType',
  'TSIntersectionType',
  'TSIntrinsicKeyword',
  'TSLiteralType',
  'TSMappedType',
  'TSNamedTupleMember',
  'TSNeverKeyword',
  'TSNullKeyword',
  'TSNumberKeyword',
  'TSObjectKeyword',
  'TSParenthesizedType',
  'TSStringKeyword',
  'TSSymbolKeyword',
  'TSTemplateLiteralType',
  'TSThisType',
  'TSTupleType',
  'TSTypeLiteral',
  'TSTypeOperator',
  'TSTypePredicate',
  'TSTypeQuery',
  'TSTypeReference',
  'TSUndefinedKeyword',
  'TSUnionType',
  'TSUnknownKeyword',
  'TSVoidKeyword',
])

const isTypeNode = (node: ESTree.Node): node is ESTree.TSType => typeNodeKinds.has(node.type)

const typeReferenceName = (type: ESTree.TSTypeReference): string | undefined => (type.typeName.type === 'Identifier' ? type.typeName.name : undefined)

const isInsideTypeAliasDeclaration = (node: ESTree.Node): boolean => {
  let current: ESTree.Node | undefined = node.parent ?? undefined
  while (current !== undefined && current.type !== 'Program') {
    if (current.type === 'TSTypeAliasDeclaration') {
      return true
    }
    current = current.parent ?? undefined
  }
  return false
}

const isPlainAliasConsumerUse = (node: ESTree.TSType, environment: TypeEnvironment): boolean => {
  const typeArgumentCount = node.type === 'TSTypeReference' ? (node.typeArguments?.params.length ?? 0) : 0
  if (node.type !== 'TSTypeReference' || typeArgumentCount > 0) {
    return false
  }
  const name = typeReferenceName(node)
  return name !== undefined && environment.aliases.has(name) && !isInsideTypeAliasDeclaration(node)
}

const shouldReportType = (node: ESTree.TSType, environment: TypeEnvironment): boolean => {
  if (isPlainAliasConsumerUse(node, environment)) {
    return false
  }
  if (classifyUnsafeDictionary(node, environment) === undefined) {
    return false
  }
  let current: ESTree.Node | undefined = node.parent ?? undefined
  while (current !== undefined && current.type !== 'Program') {
    if (isTypeNode(current) && classifyUnsafeDictionary(current, environment) !== undefined) {
      return false
    }
    current = current.parent ?? undefined
  }
  return true
}

/** Disallow object-dictionary contracts whose direct value type is an unsafe escape hatch. */
export const noUnsafeDictionaryTypeRule = defineRule({
  createOnce(context) {
    let environment: TypeEnvironment | undefined = undefined
    const report = (node: ESTree.Node, value: string) => {
      context.report({ data: { value }, messageId: 'unsafeDictionary', node })
    }
    const reportIfUnsafe = (node: ESTree.TSType) => {
      if (environment === undefined || !shouldReportType(node, environment)) {
        return
      }
      const unsafe = classifyUnsafeDictionary(node, environment) ?? undefined
      if (unsafe === undefined) {
        return
      }
      report(node, unsafe.unsafeValue)
    }

    return {
      Program(node) {
        environment = createTypeEnvironment(node)
      },
      TSIndexSignature(node) {
        const annotation = node.typeAnnotation ?? undefined
        if (environment === undefined || annotation === undefined || node.parent.type === 'TSTypeLiteral') {
          return
        }
        const unsafe = classifyUnsafeDictionaryValue(annotation.typeAnnotation, environment) ?? undefined
        if (unsafe !== undefined) {
          report(node, unsafe.unsafeValue)
        }
      },
      TSMappedType: reportIfUnsafe,
      TSTypeLiteral: reportIfUnsafe,
      TSTypeReference: reportIfUnsafe,
    }
  },
  meta: {
    docs: {
      description:
        'Disallow object-dictionary contracts whose direct value type is unknown, any, object, {}, or a union/alias containing one of those escape hatches.',
    },
    messages: {
      unsafeDictionary:
        "This dictionary's {{value}} value type gives callers no concrete value contract. Use an owner/schema-derived value type; parse external payloads before insertion.",
    },
    type: 'problem',
  },
})
