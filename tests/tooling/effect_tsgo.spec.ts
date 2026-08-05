import { afterEach, describe, expect, test } from 'bun:test'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const roots: string[] = []
const projectRoot = resolve(import.meta.dirname, '../..')
const oxlint = join(projectRoot, 'node_modules/.bin/oxlint')
const effectPackage = join(projectRoot, 'node_modules/effect')

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
