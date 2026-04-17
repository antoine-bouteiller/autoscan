import { describe, expect, test } from 'vite-plus/test'

import { sendMessageValidator } from '#features/send_message/validators/send_message.validator'

describe('sendMessageValidator', () => {
  test('should parse valid body', () => {
    const result = sendMessageValidator.safeParse({ text: 'hello' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.text).toBe('hello')
    }
  })

  test('should reject missing text', () => {
    const result = sendMessageValidator.safeParse({})
    expect(result.success).toBe(false)
  })

  test('should reject non-string text', () => {
    const result = sendMessageValidator.safeParse({ text: 42 })
    expect(result.success).toBe(false)
  })
})
