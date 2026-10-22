/*
 * Writes nix/deps.json: the npm tarballs of the production dependency closure
 * resolved in bun.lock, keyed by their node_modules install path. The flake
 * fetches and unpacks them to build the package without running `bun install`.
 */
import { Schema } from 'effect'

const Versions = Schema.optional(Schema.Record(Schema.String, Schema.String))

const Meta = Schema.Struct({
  dependencies: Versions,
  optionalDependencies: Versions,
  optionalPeers: Schema.optional(Schema.Array(Schema.String)),
  peerDependencies: Versions,
})

const Entry = Schema.Tuple([Schema.String, Schema.String, Meta, Schema.String])

const Lockfile = Schema.Struct({
  packages: Schema.Record(Schema.String, Entry),
  workspaces: Schema.Record(Schema.String, Schema.Struct({ dependencies: Versions })),
})

interface Dep {
  readonly hash: string
  readonly path: string
  readonly url: string
}

const root = new URL('../', import.meta.url)
const lock = Schema.decodeUnknownSync(Lockfile)(Bun.JSONC.parse(await Bun.file(new URL('bun.lock', root)).text()))

/*
 * Lock keys chain package names with `/` (`parent/child` for a nested copy),
 * so a key is tracked as its list of names to cope with scoped packages.
 */
const resolve = (parent: readonly string[], name: string): readonly string[] | undefined => {
  for (let depth = parent.length; depth >= 0; depth--) {
    const names = [...parent.slice(0, depth), name]
    if (names.join('/') in lock.packages) {
      return names
    }
  }
  return undefined
}

const requiredDeps = (meta: typeof Meta.Type) => [
  ...Object.keys(meta.dependencies ?? {}),
  ...Object.keys(meta.peerDependencies ?? {}).filter((name) => meta.optionalPeers?.includes(name) !== true),
]

const tarballUrl = (key: string, id: string, registry: string) => {
  const at = id.lastIndexOf('@')
  const name = id.slice(0, at)
  if (at <= 0 || registry !== '') {
    throw new Error(`${key}: only npm registry packages are supported (${id})`)
  }
  return `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${id.slice(at + 1)}.tgz`
}

const closure = new Map<string, Dep>()

const visit = (names: readonly string[]) => {
  const key = names.join('/')
  if (closure.has(key)) {
    return
  }
  const entry = lock.packages[key]
  if (entry === undefined) {
    throw new Error(`${key}: missing from bun.lock`)
  }
  const [id, registry, meta, hash] = entry
  /*
   * Platform-specific optional dependencies would make the closure differ per
   * system; none exist in the production closure, so they are refused.
   */
  if (Object.keys(meta.optionalDependencies ?? {}).length > 0) {
    throw new Error(`${key}: optional dependencies are not supported`)
  }
  closure.set(key, { hash, path: `node_modules/${names.join('/node_modules/')}`, url: tarballUrl(key, id, registry) })
  for (const name of requiredDeps(meta)) {
    const resolved = resolve(names, name)
    if (resolved === undefined) {
      throw new Error(`${key}: dependency ${name} is not in bun.lock`)
    }
    visit(resolved)
  }
}

for (const name of Object.keys(lock.workspaces['']?.dependencies ?? {})) {
  visit([name])
}

const deps = [...closure.values()].toSorted((left, right) => left.path.localeCompare(right.path))
await Bun.write(new URL('nix/deps.json', root), `${JSON.stringify(deps, undefined, 2)}\n`)
