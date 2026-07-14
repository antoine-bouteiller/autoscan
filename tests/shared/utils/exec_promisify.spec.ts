import { describe, expect, test } from 'bun:test'

import { CommandExecutionError } from '@/shared/errors/command'
import { spawnPromise } from '@/shared/utils/exec_promisify'

describe('spawnPromise', () => {
  test('should resolve with stdout when the command succeeds', async () => {
    const result = await spawnPromise('printf', ['hello'])

    expect(result).toBe('hello')
  })

  test('should pass env to the subprocess', async () => {
    const result = await spawnPromise('sh', ['-c', 'printf "$FOO"'], { env: { FOO: 'bar' } })

    expect(result).toBe('bar')
  })

  test('should return CommandExecutionError when the command exits non-zero', async () => {
    const result = await spawnPromise('sh', ['-c', 'echo boom >&2; exit 3'])

    expect(result).toBeInstanceOf(CommandExecutionError)
    expect(result instanceof Error && result.message).toContain('exit code 3')
    expect(result instanceof Error && result.message).toContain('boom')
  })
})
