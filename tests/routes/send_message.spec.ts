import { describe, expect } from 'vite-plus/test'

import { testWithHttpProvider } from '../utils.ts'

describe('POST /send-message', () => {
  testWithHttpProvider('should return 200 and send message', async ({ http }) => {
    const response = await http.inject({
      method: 'POST',
      payload: { text: 'Hello world' },
      url: '/send-message',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.success).toBe(true)
    expect(body.data).toEqual({ message: 'ok' })
  })

  testWithHttpProvider('should return 400 for missing text', async ({ http }) => {
    const response = await http.inject({
      method: 'POST',
      payload: {},
      url: '/send-message',
    })

    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe('BAD_REQUEST')
  })

  testWithHttpProvider('should return 400 for empty body', async ({ http }) => {
    const response = await http.inject({
      method: 'POST',
      payload: {},
      url: '/send-message',
    })

    expect(response.statusCode).toBe(400)
  })
})
