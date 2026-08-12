import { http } from '@tests/http_fixture'
import { describe, expect, it } from '@tests/it'
import { Effect } from 'effect'

describe('POST /radarr', () => {
  it.live('should return 200 for Test event', () =>
    Effect.gen(function* () {
      const response = yield* http.inject({
        method: 'POST',
        payload: { eventType: 'Test' },
        url: '/radarr',
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
      expect(body.data).toEqual({ message: 'ok' })
    })
  )

  it.live('should return 400 for invalid payload', () =>
    Effect.gen(function* () {
      const response = yield* http.inject({
        method: 'POST',
        payload: { eventType: 'InvalidEvent' },
        url: '/radarr',
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body.success).toBe(false)
      expect(body.error?.code).toBe('BAD_REQUEST')
    })
  )

  it.live('should return 200 for Download event', () =>
    Effect.gen(function* () {
      const response = yield* http.inject({
        method: 'POST',
        payload: {
          eventType: 'Download',
          movie: { folderPath: '/movies/test', title: 'Test Movie', tmdbId: 123 },
          movieFile: { relativePath: 'movie.mkv' },
        },
        url: '/radarr',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().success).toBe(true)
    })
  )

  it.live('should return 200 for MovieDelete event', () =>
    Effect.gen(function* () {
      const response = yield* http.inject({
        method: 'POST',
        payload: {
          deleteFiles: true,
          eventType: 'MovieDelete',
          movie: { folderPath: '/movies/test', title: 'Test Movie', tmdbId: 123 },
        },
        url: '/radarr',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().success).toBe(true)
    })
  )

  it.live('should return 400 for empty body', () =>
    Effect.gen(function* () {
      const response = yield* http.inject({
        method: 'POST',
        payload: {},
        url: '/radarr',
      })

      expect(response.statusCode).toBe(400)
    })
  )
})
