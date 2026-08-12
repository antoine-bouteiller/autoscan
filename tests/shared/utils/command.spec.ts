import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { BunServices } from '@effect/platform-bun'
import { makeTestDir } from '@tests/utils'
import { Effect, Fiber, Result } from 'effect'

import { CommandExecutionError } from '@/shared/errors/command'
import { spawn } from '@/shared/utils/command'

const run = <Success, Error>(effect: Effect.Effect<Success, Error, BunServices.BunServices>): Promise<Success> =>
  Effect.runPromise(Effect.provide(effect, BunServices.layer))

describe('spawn', () => {
  test('returns stdout', async () => {
    expect(await run(spawn({ args: ['hello'], command: 'printf' }))).toBe('hello')
  })

  test('passes environment variables while inheriting the parent environment', async () => {
    const output = await run(spawn({ args: ['-c', 'printf "$AUTOSCAN_TEST:$PATH"'], command: 'sh', env: { AUTOSCAN_TEST: 'value' } }))
    expect(output).toBe(`value:${process.env['PATH']}`)
  })

  test('does not leave stdin open', async () => {
    expect(await run(spawn({ command: 'cat' }))).toBe('')
  })

  test('reports non-zero exits', async () => {
    const result = await run(Effect.result(spawn({ args: ['-c', 'echo failed >&2; exit 2'], command: 'sh' })))
    expect(Result.isFailure(result) && result.failure).toBeInstanceOf(CommandExecutionError)
  })

  test('terminates a child when interrupted', async () => {
    const directory = makeTestDir()
    const pidFile = join(directory, 'pid')
    try {
      await run(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(spawn({ args: ['-c', `echo $$ > ${pidFile}; sleep 30`], command: 'sh' }))
          while (!existsSync(pidFile)) {
            yield* Effect.sleep(20)
          }
          yield* Fiber.interrupt(fiber)
        })
      )
      const pid = readFileSync(pidFile, 'utf8').trim()
      expect(Bun.spawnSync(['kill', '-0', pid]).exitCode).not.toBe(0)
    } finally {
      rmSync(directory, { recursive: true })
    }
  })

  test('reports command timeouts', async () => {
    const result = await run(Effect.result(spawn({ args: ['-c', 'sleep 30'], command: 'sh', timeout: 50 })))
    expect(Result.isFailure(result) && result.failure).toBeInstanceOf(CommandExecutionError)
  })
})
