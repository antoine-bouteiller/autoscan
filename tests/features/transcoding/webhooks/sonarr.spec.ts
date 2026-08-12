import { http } from '@tests/http_fixture'
import { describe, expect, it } from '@tests/it'
import { Effect } from 'effect'

describe('POST /sonarr', () => {
  it.live('should return 200 for Test event', () =>
    Effect.gen(function* () {
      const response = yield* http.inject({
        method: 'POST',
        payload: { eventType: 'Test' },
        url: '/sonarr',
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
        url: '/sonarr',
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
          episodeFile: { relativePath: 'S01E01.mkv' },
          episodes: [{ title: 'Pilot' }],
          eventType: 'Download',
          series: { path: '/tv/test', title: 'Test Show', tmdbId: 456 },
        },
        url: '/sonarr',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().success).toBe(true)
    })
  )

  it.live('should return 200 for SeriesDelete event', () =>
    Effect.gen(function* () {
      const response = yield* http.inject({
        method: 'POST',
        payload: {
          eventType: 'SeriesDelete',
          series: { path: '/tv/test', title: 'Test Show', tmdbId: 456 },
        },
        url: '/sonarr',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().success).toBe(true)
    })
  )

  it.live('should return 200 for Rename event', () =>
    Effect.gen(function* () {
      const response = yield* http.inject({
        method: 'POST',
        payload: {
          eventType: 'Rename',
          series: { path: '/tv/test', title: 'Test Show', tmdbId: 456 },
        },
        url: '/sonarr',
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
        url: '/sonarr',
      })

      expect(response.statusCode).toBe(400)
    })
  )
})
