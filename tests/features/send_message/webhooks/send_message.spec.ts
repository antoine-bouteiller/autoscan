import { http } from '@tests/http_fixture'
import { describe, expect, it } from '@tests/it'
import { Effect } from 'effect'

describe('POST /send_message', () => {
  it.live('should return 200 and send message', () =>
    Effect.gen(function* () {
      const response = yield* http.inject({
        method: 'POST',
        payload: { text: 'Hello world' },
        url: '/send_message',
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
      expect(body.data).toEqual({ message: 'ok' })
    })
  )

  it.live('should return 400 for missing text', () =>
    Effect.gen(function* () {
      const response = yield* http.inject({
        method: 'POST',
        payload: {},
        url: '/send_message',
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body.success).toBe(false)
      expect(body.error?.code).toBe('BAD_REQUEST')
    })
  )

  it.live('should return 400 for empty body', () =>
    Effect.gen(function* () {
      const response = yield* http.inject({
        method: 'POST',
        payload: {},
        url: '/send_message',
      })

      expect(response.statusCode).toBe(400)
    })
  )
})
