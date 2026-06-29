import { describe, expect, test } from 'bun:test'

import { http } from '#tests/http_fixture'

describe('POST /sonarr', () => {
  test('should return 200 for Test event', async () => {
    const response = await http.inject({
      method: 'POST',
      payload: { eventType: 'Test' },
      url: '/sonarr',
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
      url: '/sonarr',
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

  test('should return 200 for SeriesDelete event', async () => {
    const response = await http.inject({
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

  test('should return 200 for Rename event', async () => {
    const response = await http.inject({
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

  test('should return 400 for empty body', async () => {
    const response = await http.inject({
      method: 'POST',
      payload: {},
      url: '/sonarr',
    })

    expect(response.statusCode).toBe(400)
  })
})
