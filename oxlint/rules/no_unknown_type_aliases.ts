import { defineRule, type ESTree } from '@oxlint/plugins'

const referencedAliasName = (type: ESTree.TSType): string | undefined => {
  if (type.type === 'TSParenthesizedType') {
    return referencedAliasName(type.typeAnnotation)
  }
  if (type.type !== 'TSTypeReference' || type.typeName.type !== 'Identifier') {
    return undefined
  }
  return (type.typeArguments?.params.length ?? 0) === 0 ? type.typeName.name : undefined
}

/** Ban named aliases that merely conceal TypeScript's unknown top type. */
export const noUnknownTypeAliasesRule = defineRule({
  createOnce(context) {
    const aliases = new Map<string, ESTree.TSTypeAliasDeclaration>()

    const resolvesToUnknown = (type: ESTree.TSType, visited = new Set<string>()): boolean => {
      if (type.type === 'TSUnknownKeyword') {
        return true
      }
      if (type.type === 'TSParenthesizedType') {
        return resolvesToUnknown(type.typeAnnotation, visited)
      }
      const name = referencedAliasName(type)
      if (name === undefined || visited.has(name)) {
        return false
      }
      const alias = aliases.get(name)
      const typeParameters = alias?.typeParameters ?? undefined
      if (alias === undefined || typeParameters !== undefined) {
        return false
      }
      const nextVisited = new Set(visited)
      nextVisited.add(name)
      return resolvesToUnknown(alias.typeAnnotation, nextVisited)
    }

    return {
      Program(node) {
        aliases.clear()
        for (const statement of node.body) {
          const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
          if (declaration?.type === 'TSTypeAliasDeclaration') {
            aliases.set(declaration.id.name, declaration)
          }
        }
        for (const alias of aliases.values()) {
          if (!resolvesToUnknown(alias.typeAnnotation, new Set([alias.id.name]))) {
            continue
          }
          context.report({
            data: { alias: alias.id.name },
            messageId: 'unknownAlias',
            node: alias.id,
          })
        }
      },
    }
  },
  meta: {
    docs: {
      description: 'Disallow type aliases whose resolved type is unknown; unknown must remain visible at an allowed boundary.',
    },
    messages: {
      unknownAlias:
        'Type alias `{{alias}}` hides `unknown`. Keep `unknown` explicit at the parsing boundary or on an allowed `cause` field; otherwise use the parsed owner type.',
    },
    type: 'problem',
  },
})
