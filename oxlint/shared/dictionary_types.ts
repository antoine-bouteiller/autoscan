import { type ESTree } from '@oxlint/plugins'

const BUILT_INS = new Set(['Record', 'Readonly', 'Partial', 'Required', 'Pick', 'Omit', 'PropertyKey', 'NonNullable'])
const TRANSPARENT_WRAPPERS = new Set(['Readonly', 'Partial', 'Required', 'NonNullable'])

type TypeAliasEnvironment = ReadonlyMap<string, ESTree.TSType>

interface ResolvedType {
  readonly type: ESTree.TSType
  readonly substitutions: TypeAliasEnvironment
}

interface ResolutionContext {
  readonly environment: TypeEnvironment
  readonly substitutions: TypeAliasEnvironment
  readonly resolvingAliases: ReadonlySet<string>
}

export interface UnsafeDictionary {
  readonly kind: 'unsafe-dictionary'
  readonly unsafeValue: 'any' | 'empty-object' | 'object' | 'union' | 'unknown'
}

export type WideningTargetKind = 'anonymous object' | 'generic container' | 'object' | 'open dictionary' | 'unknown'

export interface WideningTarget {
  readonly kind: WideningTargetKind
}

export interface TypeEnvironment {
  readonly aliases: ReadonlyMap<string, ESTree.TSTypeAliasDeclaration>
  readonly interfaces: ReadonlyMap<string, readonly ESTree.TSInterfaceDeclaration[]>
  readonly shadowedBuiltIns: ReadonlySet<string>
}

const declaredStatement = (statement: ESTree.Statement): ESTree.Node | undefined =>
  statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration' ? (statement.declaration ?? undefined) : statement

const typeReferenceName = (type: ESTree.TSTypeReference): string | undefined => (type.typeName.type === 'Identifier' ? type.typeName.name : undefined)

const isBuiltIn = (name: string, environment: TypeEnvironment): boolean => BUILT_INS.has(name) && !environment.shadowedBuiltIns.has(name)

const unwrapTransparentType = (type: ESTree.TSType): ESTree.TSType => {
  let current = type
  while (current.type === 'TSParenthesizedType' || (current.type === 'TSTypeOperator' && current.operator === 'readonly')) {
    current = current.typeAnnotation
  }
  return current
}

const isUnappliedReferenceTo = (type: ESTree.TSType, name: string): boolean => {
  const unwrapped = unwrapTransparentType(type)
  return unwrapped.type === 'TSTypeReference' && typeReferenceName(unwrapped) === name && (unwrapped.typeArguments?.params.length ?? 0) === 0
}

const isNeverType = (type: ESTree.TSType): boolean => unwrapTransparentType(type).type === 'TSNeverKeyword'

const isEffectivelyEmptyMember = (member: ESTree.TSSignature): boolean => {
  if (member.type !== 'TSPropertySignature' || !member.optional) {
    return false
  }
  const annotation = member.typeAnnotation ?? undefined
  return annotation !== undefined && isNeverType(annotation.typeAnnotation)
}

const isEffectivelyEmptyTypeLiteral = (type: ESTree.TSTypeLiteral): boolean =>
  type.members.length === 0 || type.members.every(isEffectivelyEmptyMember)

const isEffectivelyEmptyInterface = (declarations: readonly ESTree.TSInterfaceDeclaration[]): boolean => {
  if (declarations.length !== 1) {
    return false
  }
  const [type] = declarations
  return type !== undefined && type.extends.length === 0 && (type.body.body.length === 0 || type.body.body.every(isEffectivelyEmptyMember))
}

const noteBuiltInShadow = (name: string, shadowedBuiltIns: Set<string>): void => {
  if (BUILT_INS.has(name)) {
    shadowedBuiltIns.add(name)
  }
}

interface MutableTypeEnvironment {
  readonly aliases: Map<string, ESTree.TSTypeAliasDeclaration>
  readonly interfaces: Map<string, ESTree.TSInterfaceDeclaration[]>
  readonly shadowedBuiltIns: Set<string>
}

const addAlias = (declaration: ESTree.TSTypeAliasDeclaration, environment: MutableTypeEnvironment): void => {
  if (environment.aliases.has(declaration.id.name)) {
    environment.shadowedBuiltIns.add(declaration.id.name)
  } else {
    environment.aliases.set(declaration.id.name, declaration)
  }
  noteBuiltInShadow(declaration.id.name, environment.shadowedBuiltIns)
}

const addInterface = (declaration: ESTree.TSInterfaceDeclaration, environment: MutableTypeEnvironment): void => {
  const declarations = environment.interfaces.get(declaration.id.name) ?? []
  declarations.push(declaration)
  environment.interfaces.set(declaration.id.name, declarations)
  noteBuiltInShadow(declaration.id.name, environment.shadowedBuiltIns)
}

const addClassOrFunction = (declaration: { readonly id?: { readonly name: string } }, environment: MutableTypeEnvironment): void => {
  const identifier = declaration.id ?? undefined
  if (identifier !== undefined) {
    noteBuiltInShadow(identifier.name, environment.shadowedBuiltIns)
  }
}

const addDeclarationToEnvironment = (declaration: ESTree.Node | undefined, environment: MutableTypeEnvironment): void => {
  if (declaration === undefined) {
    return
  }
  switch (declaration.type) {
    case 'ImportDeclaration': {
      for (const specifier of declaration.specifiers) {
        noteBuiltInShadow(specifier.local.name, environment.shadowedBuiltIns)
      }
      return
    }
    case 'TSTypeAliasDeclaration': {
      return addAlias(declaration, environment)
    }
    case 'TSInterfaceDeclaration': {
      return addInterface(declaration, environment)
    }
    case 'TSEnumDeclaration': {
      return noteBuiltInShadow(declaration.id.name, environment.shadowedBuiltIns)
    }
    case 'ClassDeclaration': {
      return addClassOrFunction({ id: declaration.id ?? undefined }, environment)
    }
    case 'FunctionDeclaration': {
      return addClassOrFunction({ id: declaration.id ?? undefined }, environment)
    }
    default: {
      return
    }
  }
}

export const createTypeEnvironment = (program: ESTree.Program): TypeEnvironment => {
  const environment: MutableTypeEnvironment = { aliases: new Map(), interfaces: new Map(), shadowedBuiltIns: new Set() }
  for (const statement of program.body) {
    addDeclarationToEnvironment(declaredStatement(statement), environment)
  }
  return environment
}

const resolvedSubstitutionArgument = (type: ESTree.TSType, base: TypeAliasEnvironment, resolving: ReadonlySet<string> = new Set()): ESTree.TSType => {
  const unwrapped = unwrapTransparentType(type)
  if (unwrapped.type !== 'TSTypeReference') {
    return type
  }
  const name = typeReferenceName(unwrapped)
  if (name === undefined || resolving.has(name)) {
    return type
  }
  const substitution = base.get(name)
  if (substitution === undefined) {
    return type
  }
  const nextResolving = new Set(resolving)
  nextResolving.add(name)
  return resolvedSubstitutionArgument(substitution, base, nextResolving)
}

const aliasSubstitution = (
  alias: ESTree.TSTypeAliasDeclaration,
  type: ESTree.TSTypeReference,
  base: TypeAliasEnvironment
): TypeAliasEnvironment | undefined => {
  const parameters = alias.typeParameters?.params ?? []
  const typeArguments = type.typeArguments?.params ?? []
  const next = new Map(base)
  for (const [index, parameter] of parameters.entries()) {
    const argument = typeArguments[index] ?? parameter.default ?? undefined
    if (argument === undefined) {
      return undefined
    }
    next.set(parameter.name.name, resolvedSubstitutionArgument(argument, next))
  }
  return next
}

const nextContext = (context: ResolutionContext, name: string, substitutions = context.substitutions): ResolutionContext => ({
  environment: context.environment,
  resolvingAliases: new Set([...context.resolvingAliases, name]),
  substitutions,
})

const unsafeDirectValue = (type: ESTree.TSType, context: ResolutionContext): UnsafeDictionary['unsafeValue'] | undefined => {
  const unwrapped = unwrapTransparentType(type)
  const directValues = new Map<string, UnsafeDictionary['unsafeValue']>([
    ['TSAnyKeyword', 'any'],
    ['TSObjectKeyword', 'object'],
    ['TSUnknownKeyword', 'unknown'],
  ])
  const directValue = directValues.get(unwrapped.type)
  if (directValue !== undefined) {
    return directValue
  }
  if (unwrapped.type === 'TSTypeLiteral') {
    return isEffectivelyEmptyTypeLiteral(unwrapped) ? 'empty-object' : undefined
  }
  if (unwrapped.type === 'TSUnionType') {
    return unwrapped.types.some((member) => unsafeDirectValue(member, context) !== undefined) ? 'union' : undefined
  }
  if (unwrapped.type === 'TSIntersectionType') {
    return unsafeIntersectionValue(unwrapped, context)
  }
  return unwrapped.type === 'TSTypeReference' ? unsafeReferenceValue(unwrapped, context) : undefined
}

const unsafeIntersectionValue = (type: ESTree.TSIntersectionType, context: ResolutionContext): UnsafeDictionary['unsafeValue'] | undefined => {
  const members = type.types.map((member) => unsafeDirectValue(member, context))
  if (members.includes('any')) {
    return 'any'
  }
  return members.length > 0 && members.every((member) => member !== undefined) ? members[0] : undefined
}

const unsafeReferenceValue = (type: ESTree.TSTypeReference, context: ResolutionContext): UnsafeDictionary['unsafeValue'] | undefined => {
  const name = typeReferenceName(type)
  if (name === undefined) {
    return undefined
  }
  const substitution = context.substitutions.get(name)
  if (substitution !== undefined) {
    return isUnappliedReferenceTo(substitution, name) ? undefined : unsafeDirectValue(substitution, context)
  }
  if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, context.environment)) {
    const wrapped = type.typeArguments?.params[0]
    return wrapped === undefined ? undefined : unsafeDirectValue(wrapped, context)
  }
  const declarations = context.environment.interfaces.get(name)
  if (declarations !== undefined) {
    return isEffectivelyEmptyInterface(declarations) ? 'empty-object' : undefined
  }
  const alias = context.environment.aliases.get(name)
  if (alias === undefined || context.resolvingAliases.has(name)) {
    return undefined
  }
  const substitutions = aliasSubstitution(alias, type, context.substitutions)
  return substitutions === undefined ? undefined : unsafeDirectValue(alias.typeAnnotation, nextContext(context, name, substitutions))
}

const dictionaryValueTypes = (type: ESTree.TSType, context: ResolutionContext): readonly ResolvedType[] => {
  const unwrapped = unwrapTransparentType(type)
  if (unwrapped.type === 'TSTypeLiteral') {
    return unwrapped.members.flatMap(dictionaryMemberValueTypes(context))
  }
  if (unwrapped.type === 'TSMappedType') {
    const annotation = unwrapped.typeAnnotation ?? undefined
    return annotation === undefined ? [] : [{ substitutions: context.substitutions, type: annotation }]
  }
  return unwrapped.type === 'TSTypeReference' ? dictionaryReferenceValueTypes(unwrapped, context) : []
}

const dictionaryMemberValueTypes =
  (context: ResolutionContext) =>
  (member: ESTree.TSSignature): readonly ResolvedType[] => {
    if (member.type !== 'TSIndexSignature') {
      return []
    }
    const annotation = member.typeAnnotation ?? undefined
    return annotation === undefined ? [] : [{ substitutions: context.substitutions, type: annotation.typeAnnotation }]
  }

const dictionaryBuiltInValueTypes = (type: ESTree.TSTypeReference, name: string, context: ResolutionContext): readonly ResolvedType[] | undefined => {
  if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, context.environment)) {
    const wrapped = type.typeArguments?.params[0]
    return wrapped === undefined ? [] : dictionaryValueTypes(wrapped, context)
  }
  if (name === 'Record' && isBuiltIn(name, context.environment)) {
    const value = type.typeArguments?.params[1]
    return value === undefined ? [] : [{ substitutions: context.substitutions, type: value }]
  }
  if ((name === 'Pick' || name === 'Omit') && isBuiltIn(name, context.environment)) {
    const source = type.typeArguments?.params[0]
    return source === undefined ? [] : dictionaryValueTypes(source, context)
  }
  return undefined
}

const dictionaryAliasValueTypes = (type: ESTree.TSTypeReference, name: string, context: ResolutionContext): readonly ResolvedType[] => {
  const alias = context.environment.aliases.get(name)
  if (alias === undefined || context.resolvingAliases.has(name)) {
    return []
  }
  const substitutions = aliasSubstitution(alias, type, context.substitutions)
  return substitutions === undefined ? [] : dictionaryValueTypes(alias.typeAnnotation, nextContext(context, name, substitutions))
}

const dictionaryReferenceValueTypes = (type: ESTree.TSTypeReference, context: ResolutionContext): readonly ResolvedType[] => {
  const name = typeReferenceName(type)
  if (name === undefined) {
    return []
  }
  const substitution = context.substitutions.get(name)
  if (substitution !== undefined) {
    return isUnappliedReferenceTo(substitution, name) ? [] : dictionaryValueTypes(substitution, context)
  }
  const builtInValues = dictionaryBuiltInValueTypes(type, name, context)
  return builtInValues ?? dictionaryAliasValueTypes(type, name, context)
}

const initialContext = (environment: TypeEnvironment): ResolutionContext => ({ environment, resolvingAliases: new Set(), substitutions: new Map() })

export const classifyUnsafeDictionaryValue = (valueType: ESTree.TSType, environment: TypeEnvironment): UnsafeDictionary | undefined => {
  const unsafeValue = unsafeDirectValue(valueType, initialContext(environment))
  return unsafeValue === undefined ? undefined : { kind: 'unsafe-dictionary', unsafeValue }
}

export const classifyUnsafeDictionary = (type: ESTree.TSType, environment: TypeEnvironment): UnsafeDictionary | undefined => {
  for (const valueType of dictionaryValueTypes(type, initialContext(environment))) {
    const unsafeValue = unsafeDirectValue(valueType.type, { environment, resolvingAliases: new Set(), substitutions: valueType.substitutions })
    if (unsafeValue !== undefined) {
      return { kind: 'unsafe-dictionary', unsafeValue }
    }
  }
  return undefined
}

const resolvesToDictionary = (type: ESTree.TSType, context: ResolutionContext): boolean => dictionaryValueTypes(type, context).length > 0

const literalWideningTarget = (type: ESTree.TSTypeLiteral): WideningTarget | undefined => {
  if (type.members.some((member) => member.type === 'TSIndexSignature')) {
    return { kind: 'open dictionary' }
  }
  return type.members.length > 0 ? { kind: 'anonymous object' } : undefined
}

export const classifyWideningTarget = (type: ESTree.TSType, environment: TypeEnvironment): WideningTarget | undefined => {
  const unwrapped = unwrapTransparentType(type)
  if (unwrapped.type === 'TSUnknownKeyword') {
    return { kind: 'unknown' }
  }
  if (unwrapped.type === 'TSObjectKeyword') {
    return { kind: 'object' }
  }
  if (unwrapped.type === 'TSTypeLiteral') {
    return literalWideningTarget(unwrapped)
  }
  if (unwrapped.type === 'TSMappedType') {
    return { kind: 'open dictionary' }
  }
  return unwrapped.type === 'TSTypeReference' ? wideningReferenceTarget(unwrapped, environment) : undefined
}

const wideningReferenceTarget = (type: ESTree.TSTypeReference, environment: TypeEnvironment): WideningTarget | undefined => {
  const name = typeReferenceName(type)
  if (name === undefined) {
    return undefined
  }
  if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, environment)) {
    const wrapped = type.typeArguments?.params[0]
    return wrapped === undefined ? undefined : classifyWideningTarget(wrapped, environment)
  }
  if (name === 'Record' && isBuiltIn(name, environment)) {
    return { kind: 'open dictionary' }
  }
  const alias = environment.aliases.get(name)
  if (alias === undefined) {
    return undefined
  }
  const substitutions = aliasSubstitution(alias, type, new Map())
  if (substitutions === undefined) {
    return undefined
  }
  const context = nextContext({ environment, resolvingAliases: new Set(), substitutions }, name)
  if ((alias.typeParameters?.params.length ?? 0) > 0) {
    return resolvesToDictionary(alias.typeAnnotation, context) ? { kind: 'generic container' } : undefined
  }
  return classifyAliasBroadTarget(alias.typeAnnotation, context)
}

const isBroadMappedKey = (type: ESTree.TSType, environment: TypeEnvironment, substitutions: TypeAliasEnvironment): boolean => {
  const unwrapped = unwrapTransparentType(type)
  if (unwrapped.type === 'TSStringKeyword' || unwrapped.type === 'TSNumberKeyword' || unwrapped.type === 'TSSymbolKeyword') {
    return true
  }
  if (unwrapped.type === 'TSUnionType') {
    return unwrapped.types.every((member) => isBroadMappedKey(member, environment, substitutions))
  }
  if (unwrapped.type !== 'TSTypeReference') {
    return false
  }
  const name = typeReferenceName(unwrapped)
  if (name === undefined) {
    return false
  }
  const substitution = substitutions.get(name)
  if (substitution !== undefined && !isUnappliedReferenceTo(substitution, name)) {
    return isBroadMappedKey(substitution, environment, substitutions)
  }
  return name === 'PropertyKey' && isBuiltIn(name, environment)
}

const classifyAliasBroadTarget = (type: ESTree.TSType, context: ResolutionContext): WideningTarget | undefined => {
  const unwrapped = unwrapTransparentType(type)
  if (unwrapped.type === 'TSUnknownKeyword') {
    return { kind: 'unknown' }
  }
  if (unwrapped.type === 'TSObjectKeyword') {
    return { kind: 'object' }
  }
  if (unwrapped.type === 'TSTypeLiteral') {
    return unwrapped.members.some((member) => member.type === 'TSIndexSignature') ? { kind: 'open dictionary' } : undefined
  }
  if (unwrapped.type === 'TSMappedType') {
    return isBroadMappedKey(unwrapped.constraint, context.environment, context.substitutions) ? { kind: 'open dictionary' } : undefined
  }
  return unwrapped.type === 'TSTypeReference' ? aliasReferenceBroadTarget(unwrapped, context) : undefined
}

const aliasReferenceBroadTarget = (type: ESTree.TSTypeReference, context: ResolutionContext): WideningTarget | undefined => {
  const name = typeReferenceName(type)
  if (name === undefined) {
    return undefined
  }
  const substitution = context.substitutions.get(name)
  if (substitution !== undefined) {
    return isUnappliedReferenceTo(substitution, name) ? undefined : classifyAliasBroadTarget(substitution, context)
  }
  if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, context.environment)) {
    const wrapped = type.typeArguments?.params[0]
    return wrapped === undefined ? undefined : classifyAliasBroadTarget(wrapped, context)
  }
  if (name === 'Record' && isBuiltIn(name, context.environment)) {
    return { kind: 'open dictionary' }
  }
  const alias = context.environment.aliases.get(name)
  if (alias === undefined || context.resolvingAliases.has(name)) {
    return undefined
  }
  const substitutions = aliasSubstitution(alias, type, context.substitutions)
  return substitutions === undefined ? undefined : classifyAliasBroadTarget(alias.typeAnnotation, nextContext(context, name, substitutions))
}

export const isKnownEvidenceExpression = (expression: ESTree.Expression): boolean => {
  let current = expression
  while (
    current.type === 'ParenthesizedExpression' ||
    current.type === 'TSAsExpression' ||
    current.type === 'TSTypeAssertion' ||
    current.type === 'TSNonNullExpression' ||
    current.type === 'TSSatisfiesExpression'
  ) {
    current = current.expression
  }
  if (current.type === 'ObjectExpression') {
    return true
  }
  return (
    current.type === 'ArrayExpression' ||
    current.type === 'ArrowFunctionExpression' ||
    current.type === 'ClassExpression' ||
    current.type === 'FunctionExpression' ||
    current.type === 'NewExpression' ||
    current.type === 'Literal' ||
    current.type === 'TemplateLiteral' ||
    current.type === 'UnaryExpression'
  )
}
