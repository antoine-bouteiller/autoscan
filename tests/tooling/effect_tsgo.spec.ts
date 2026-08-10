import { afterEach, describe, expect, test } from 'bun:test'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const roots: string[] = []
const projectRoot = resolve(import.meta.dirname, '../..')
const oxlint = join(projectRoot, 'node_modules/.bin/oxlint')
const effectPackage = join(projectRoot, 'node_modules/effect')
const effectVersion = '4.0.0-beta.103'
const effectPackages = ['effect', '@effect/platform-bun', '@effect/platform-node-shared'] as const

const readManifest = async (path: string) => {
  const manifest: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (typeof manifest !== 'object' || manifest === null) {
    throw new TypeError(`Invalid package manifest: ${path}`)
  }
  const version = Reflect.get(manifest, 'version')
  const peers = Reflect.get(manifest, 'peerDependencies')
  const peerRange = typeof peers === 'object' && peers !== null ? Reflect.get(peers, 'effect') : undefined
  if (typeof version !== 'string' || (peerRange !== undefined && typeof peerRange !== 'string')) {
    throw new TypeError(`Invalid Effect package manifest: ${path}`)
  }
  return { peerRange, version }
}

const readEffectTuple = async (root: string) =>
  Promise.all(effectPackages.map(async (name) => ({ name, ...(await readManifest(join(root, 'node_modules', name, 'package.json'))) })))

const validateEffectTuple = async (root: string) => {
  const packages = await readEffectTuple(root)
  return packages.flatMap(({ name, peerRange, version }) => {
    const errors = version === effectVersion ? [] : [`${name} resolved ${version}`]
    return peerRange === undefined || Bun.semver.satisfies(effectVersion, peerRange) ? errors : [...errors, `${name} requires effect ${peerRange}`]
  })
}

const runOxlint = async (root: string, source: string) => {
  const process = Bun.spawn(
    [oxlint, '--format', 'json', '--config', join(root, '.oxlintrc.json'), '--tsconfig', join(root, 'tsconfig.json'), source],
    { cwd: projectRoot, stderr: 'pipe', stdout: 'pipe' }
  )
  const [stdout, stderr, exitCode] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited])
  return { exitCode, output: stdout + stderr }
}

const makeRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), 'autoscan-effect-tsgo-'))
  roots.push(root)
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { module: 'esnext', moduleResolution: 'bundler', skipLibCheck: true, strict: true, target: 'esnext' },
      include: ['src/**/*.ts'],
    })
  )
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })))
})

describe('Effect TSGO tooling contract', () => {
  test('pins one compatible Effect platform tuple', async () => {
    expect(await validateEffectTuple(projectRoot)).toEqual([])
  })

  test('rejects a mismatched Effect platform tuple fixture', async () => {
    const root = await makeRoot()
    for (const name of effectPackages) {
      const directory = join(root, 'node_modules', name)
      await mkdir(directory, { recursive: true })
      await writeFile(
        join(directory, 'package.json'),
        JSON.stringify({ name, peerDependencies: name === 'effect' ? undefined : { effect: '^4.0.0-beta.104' }, version: '4.0.0-beta.104' })
      )
    }

    expect(await validateEffectTuple(root)).toEqual([
      'effect resolved 4.0.0-beta.104',
      '@effect/platform-bun resolved 4.0.0-beta.104',
      '@effect/platform-bun requires effect ^4.0.0-beta.104',
      '@effect/platform-node-shared resolved 4.0.0-beta.104',
      '@effect/platform-node-shared requires effect ^4.0.0-beta.104',
    ])
  })

  test('rejects outdated, floating, missing-context, and missing-error Effects', async () => {
    const root = await makeRoot()
    await mkdir(join(root, 'node_modules'), { recursive: true })
    await symlink(effectPackage, join(root, 'node_modules/effect'))
    await writeFile(
      join(root, '.oxlintrc.json'),
      JSON.stringify({
        options: { typeAware: true, typeCheck: true },
        plugins: ['effecttsgo'],
        rules: {
          'effecttsgo/floating-effect': 'error',
          'effecttsgo/missing-effect-context': 'error',
          'effecttsgo/missing-effect-error': 'error',
          'effecttsgo/outdated-api': 'error',
        },
      })
    )
    const source = join(root, 'src/invalid.ts')
    await writeFile(
      source,
      [
        'import { Context, Effect } from "effect"',
        'class Config extends Context.Service<Config, { value: string }>()("Config") {}',
        'Effect.succeed("floating")',
        'export const old = Effect.either(Effect.succeed(1))',
        'export const needsConfig: Effect.Effect<string> = Effect.gen(function* () { return (yield* Config).value })',
        'export const fails: Effect.Effect<never> = Effect.fail("typed failure")',
      ].join('\n')
    )

    const result = await runOxlint(root, source)
    expect(result.exitCode).not.toBe(0)
    for (const rule of ['outdated-api', 'floating-effect', 'missing-effect-context', 'missing-effect-error']) {
      expect(result.output).toContain(`effecttsgo(${rule})`)
    }
  })

  test('rejects catch handlers that only succeed with a value', async () => {
    const root = await makeRoot()
    await mkdir(join(root, 'node_modules'), { recursive: true })
    await symlink(effectPackage, join(root, 'node_modules/effect'))
    await writeFile(
      join(root, '.oxlintrc.json'),
      JSON.stringify({
        options: { typeAware: true, typeCheck: true },
        plugins: ['effecttsgo'],
        rules: { 'effecttsgo/catch-to-or-else-succeed': 'error' },
      })
    )
    const source = join(root, 'src/catch.ts')
    await writeFile(
      source,
      'import { Effect } from "effect"\nexport const recovered = Effect.fail("nope").pipe(Effect.catch(() => Effect.succeed("ok")))\n'
    )

    const result = await runOxlint(root, source)
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain('effecttsgo(catch-to-or-else-succeed)')
  })
  test('detects duplicate Effect package versions without installing', async () => {
    const root = await makeRoot()
    const first = join(root, 'node_modules/a/node_modules/effect')
    const second = join(root, 'node_modules/b/node_modules/effect')
    await mkdir(join(root, 'node_modules/a/node_modules'), { recursive: true })
    await mkdir(join(root, 'node_modules/b/node_modules'), { recursive: true })
    await cp(effectPackage, first, { recursive: true })
    await cp(effectPackage, second, { recursive: true })
    const packagePath = join(second, 'package.json')
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
    packageJson.version = '4.0.0-fixture-duplicate'
    await writeFile(packagePath, `${JSON.stringify(packageJson, undefined, 2)}\n`)
    await writeFile(
      join(root, '.oxlintrc.json'),
      JSON.stringify({ options: { typeAware: true, typeCheck: true }, plugins: ['effecttsgo'], rules: { 'effecttsgo/duplicate-package': 'error' } })
    )
    const source = join(root, 'src/duplicate.ts')
    await writeFile(
      source,
      [
        'import * as A from "../node_modules/a/node_modules/effect/dist/index.js"',
        'import * as B from "../node_modules/b/node_modules/effect/dist/index.js"',
        'export const a = A.Effect.succeed(1)',
        'export const b = B.Effect.succeed(2)',
      ].join('\n')
    )

    const result = await runOxlint(root, source)
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain('effecttsgo(duplicate-package)')
  })
})
