import { BunServices } from '@effect/platform-bun'
import { describe, expect, it } from '@tests/it'
import { Effect, FileSystem } from 'effect'

import { spawn } from '@/shared/utils/command'

const entry = new URL('compiled_smoke.ts', import.meta.url).pathname
const fixture = new URL('../../fixtures/speech/speech.mka', import.meta.url).pathname

const repository = new URL('../../..', import.meta.url).pathname
const sandbox = `(version 1)(allow default)(deny network*)(deny file-read* (subpath "${repository}node_modules") (subpath "${repository}src"))`

// Linux CI cannot create a network namespace unprivileged; `nix build .#checks.<system>.speech-offline` covers Linux.
describe.skipIf(process.platform !== 'darwin')('compiled speech sampling', () => {
  it.live(
    'samples offline without node_modules, with deterministic intervals and isolated window state',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const directory = yield* fs.makeTempDirectoryScoped()
        const binary = `${directory}/speech-smoke`
        yield* fs.copyFile(fixture, `${directory}/speech.mka`)
        yield* spawn({ args: ['build', '--compile', '--minify', entry, '--outfile', binary], command: process.execPath })
        expect(yield* fs.exists(`${directory}/node_modules`)).toBeFalse()
        const output = yield* spawn({
          args: ['-p', sandbox, binary, `${directory}/speech.mka`],
          command: 'sandbox-exec',
          cwd: directory,
        })
        expect(output).toContain('"windows":')
        expect(output).toContain('"milliseconds":')
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    60_000
  )
})
