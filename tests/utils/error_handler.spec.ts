import { describe, expect, mock, test } from 'bun:test'

import { logError, tryCatch } from '@/utils/error_handler'

describe('logError', () => {
  test('should not throw for Error instances', () => {
    expect(() => logError(new Error('test error'))).not.toThrow()
  })

  test('should not throw for Error with cause', () => {
    const error = new Error('outer', { cause: new Error('inner') })
    expect(() => logError(error, 'context')).not.toThrow()
  })

  test('should not throw for non-Error values', () => {
    expect(() => logError('string error')).not.toThrow()
    expect(() => logError({ key: 'value' })).not.toThrow()
    expect(() => logError(42)).not.toThrow()
  })
})

describe('tryCatch', () => {
  test('should return the result of a successful async function', async () => {
    const fn = mock(() => Promise.resolve(42))
    const result = await tryCatch(fn)
    expect(result).toBe(42)
  })

  test('should return undefined when the async function throws', async () => {
    const fn = mock(() => Promise.reject(new Error('fail')))
    const result = await tryCatch(fn)
    expect(result).toBeUndefined()
  })

  test('should pass arguments to the async function', async () => {
    const fn = mock((a: number, b: number) => Promise.resolve(a + b))
    const result = await tryCatch(fn, 3, 4)
    expect(result).toBe(7)
    expect(fn).toHaveBeenCalledWith(3, 4)
  })

  test('should handle synchronous functions', async () => {
    const fn = mock(() => 'sync result')
    const result = await tryCatch(fn)
    expect(result).toBe('sync result')
  })

  test('should handle synchronous functions that throw', async () => {
    const fn = mock(() => {
      throw new Error('sync fail')
    })
    const result = await tryCatch(fn)
    expect(result).toBeUndefined()
  })
})
