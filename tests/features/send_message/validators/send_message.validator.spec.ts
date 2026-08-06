import { describe, expect, test } from 'bun:test'

import { Result, Schema } from 'effect'

import { sendMessageValidator } from '@/features/send_message/validators/send_message.validator'

describe('sendMessageValidator', () => {
  test('should parse valid body', () => {
    const result = Schema.decodeUnknownResult(sendMessageValidator)({ text: 'hello' })
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(result.success.text).toBe('hello')
    }
  })

  test('should strip extra fields', () => {
    const result = Schema.decodeUnknownSync(sendMessageValidator)({ ignored: true, text: 'hello' })
    expect(result).toEqual({ text: 'hello' })
  })

  test('should reject missing text', () => {
    const result = Schema.decodeUnknownResult(sendMessageValidator)({})
    expect(Result.isFailure(result)).toBe(true)
  })

  test('should reject non-string text', () => {
    const result = Schema.decodeUnknownResult(sendMessageValidator)({ text: 42 })
    expect(Result.isFailure(result)).toBe(true)
  })
})
