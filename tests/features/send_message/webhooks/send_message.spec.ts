import { describe, expect, test } from 'bun:test'

import { http } from '#tests/http_fixture'

describe('POST /send_message', () => {
  test('should return 200 and send message', async () => {
    const response = await http.inject({
      method: 'POST',
      payload: { text: 'Hello world' },
      url: '/send_message',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.success).toBe(true)
    expect(body.data).toEqual({ message: 'ok' })
  })

  test('should return 400 for missing text', async () => {
    const response = await http.inject({
      method: 'POST',
      payload: {},
      url: '/send_message',
    })

    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe('BAD_REQUEST')
  })

  test('should return 400 for empty body', async () => {
    const response = await http.inject({
      method: 'POST',
      payload: {},
      url: '/send_message',
    })

    expect(response.statusCode).toBe(400)
  })
})
