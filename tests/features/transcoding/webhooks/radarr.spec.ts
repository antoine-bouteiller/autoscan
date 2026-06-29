import { describe, expect, test } from 'bun:test'

import { http } from '#tests/http_fixture'

describe('POST /radarr', () => {
  test('should return 200 for Test event', async () => {
    const response = await http.inject({
      method: 'POST',
      payload: { eventType: 'Test' },
      url: '/radarr',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.success).toBe(true)
    expect(body.data).toEqual({ message: 'ok' })
  })

  test('should return 400 for invalid payload', async () => {
    const response = await http.inject({
      method: 'POST',
      payload: { eventType: 'InvalidEvent' },
      url: '/radarr',
    })

    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe('BAD_REQUEST')
  })

  test('should return 200 for Download event', async () => {
    const response = await http.inject({
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

  test('should return 200 for MovieDelete event', async () => {
    const response = await http.inject({
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

  test('should return 400 for empty body', async () => {
    const response = await http.inject({
      method: 'POST',
      payload: {},
      url: '/radarr',
    })

    expect(response.statusCode).toBe(400)
  })
})
