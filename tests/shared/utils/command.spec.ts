import { BunServices } from '@effect/platform-bun'
import { describe, expect, it } from '@tests/it'
import { makeTestDir } from '@tests/utils'
import { Config, Effect, Fiber, FileSystem, Path, Result } from 'effect'

import { CommandExecutionError } from '@/shared/errors/command'
import { spawn } from '@/shared/utils/command'

const run = <Success, Error>(effect: Effect.Effect<Success, Error, BunServices.BunServices>) => Effect.provide(effect, BunServices.layer)

describe('spawn', () => {
  it.effect('returns stdout', () =>
    Effect.gen(function* () {
      expect(yield* run(spawn({ args: ['hello'], command: 'printf' }))).toBe('hello')
    })
  )

  it.effect('passes environment variables while inheriting the parent environment', () =>
    Effect.gen(function* () {
      const output = yield* run(spawn({ args: ['-c', 'printf "$AUTOSCAN_TEST:$PATH"'], command: 'sh', env: { AUTOSCAN_TEST: 'value' } }))
      expect(output).toBe(`value:${yield* Config.string('PATH')}`)
    })
  )

  it.effect('does not leave stdin open', () =>
    Effect.gen(function* () {
      expect(yield* run(spawn({ command: 'cat' }))).toBe('')
    })
  )

  it.effect('reports non-zero exits', () =>
    Effect.gen(function* () {
      const result = yield* run(Effect.result(spawn({ args: ['-c', 'echo failed >&2; exit 2'], command: 'sh' })))
      expect(Result.isFailure(result) && result.failure).toBeInstanceOf(CommandExecutionError)
    })
  )

  it.live('terminates a child when interrupted', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* makeTestDir
      const pidFile = path.join(directory, 'pid')
      yield* Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(spawn({ args: ['-c', `echo $$ > ${pidFile}; sleep 30`], command: 'sh' }))
        while (!(yield* fs.exists(pidFile))) {
          yield* Effect.sleep(20)
        }
        yield* Fiber.interrupt(fiber)

        const pid = (yield* fs.readFileString(pidFile)).trim()
        expect(Bun.spawnSync(['kill', '-0', pid]).exitCode).not.toBe(0)
      }).pipe(Effect.ensuring(Effect.ignore(fs.remove(directory, { recursive: true }))))
    }).pipe(run)
  )

  it.live('reports command timeouts', () =>
    Effect.gen(function* () {
      const result = yield* run(Effect.result(spawn({ args: ['-c', 'sleep 30'], command: 'sh', timeout: 50 })))
      expect(Result.isFailure(result) && result.failure).toBeInstanceOf(CommandExecutionError)
    })
  )
})
