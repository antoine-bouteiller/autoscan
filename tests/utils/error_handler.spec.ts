import { describe, expect, test } from 'vite-plus/test'

import { logError } from '../../src/utils/error'

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
