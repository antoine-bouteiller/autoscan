import { describe, expect, test } from 'bun:test'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { makeTestDir } from '@tests/utils'
import { Effect, Fiber, Result } from 'effect'

import { CommandExecutionError } from '@/shared/errors/command'
import { spawn } from '@/shared/utils/exec_promisify'

describe('spawn', () => {
  test('returns stdout', async () => {
    expect(await Effect.runPromise(spawn('printf', ['hello']))).toBe('hello')
  })

  test('passes environment variables', async () => {
    expect(await Effect.runPromise(spawn('sh', ['-c', 'printf "$AUTOSCAN_TEST"'], { env: { AUTOSCAN_TEST: 'value' } }))).toBe('value')
  })

  test('reports non-zero exits', async () => {
    const result = await Effect.runPromise(Effect.result(spawn('sh', ['-c', 'echo failed >&2; exit 2'])))
    expect(Result.isFailure(result) && result.failure).toBeInstanceOf(CommandExecutionError)
  })

  test('terminates a child when interrupted', async () => {
    const directory = makeTestDir()
    const pidFile = join(directory, 'pid')
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(spawn('sh', ['-c', `echo $$ > ${pidFile}; sleep 30`]))
          yield* Effect.sleep(50)
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
    const result = await Effect.runPromise(Effect.result(spawn('sh', ['-c', 'sleep 30'], { timeout: 50 })))
    expect(Result.isFailure(result) && result.failure).toBeInstanceOf(CommandExecutionError)
  })
})
