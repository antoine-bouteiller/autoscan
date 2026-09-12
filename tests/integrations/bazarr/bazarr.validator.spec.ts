import { describe, expect, it } from '@tests/it'
import { Effect, Result, Schema } from 'effect'

import { moviesResponseValidator } from '@/integrations/bazarr/bazarr.validator'

const movie = (overrides = {}) => ({
  missing_subtitles: [{ code2: 'fra', forced: false, hi: false }],
  path: '/movies/Film.mkv',
  radarrId: 1,
  subtitles: [{ code2: 'eng', forced: false, hi: false, path: '/movies/Film.en.srt' }],
  title: 'Film',
  ...overrides,
})

describe('Bazarr validators', () => {
  it.effect('normalizes known ISO codes and tolerates extra fields', () =>
    Effect.sync(() => {
      const result = Schema.decodeResult(moviesResponseValidator)({ data: [movie({ ignored: true })], total: 1 })
      expect(Result.isSuccess(result)).toBe(true)
      if (Result.isSuccess(result)) {
        expect(result.success.data[0]?.subtitles[0]?.code2).toBe('en')
      }
    })
  )

  it.effect('rejects unknown language codes and missing required fields', () =>
    Effect.sync(() => {
      expect(
        Result.isFailure(
          Schema.decodeResult(moviesResponseValidator)({
            data: [movie({ subtitles: [{ code2: 'xxx', forced: false, hi: false, path: '/a.srt' }] })],
            total: 1,
          })
        )
      ).toBe(true)
      expect(Result.isFailure(Schema.decodeResult(moviesResponseValidator)({ data: [movie({ title: undefined })], total: 1 }))).toBe(true)
      expect(
        Result.isFailure(
          Schema.decodeResult(moviesResponseValidator)({
            data: [movie({ subtitles: [{ code2: 'eng', forced: 'false', hi: false, path: '/a.srt' }] })],
            total: 1,
          })
        )
      ).toBe(true)
      expect(Result.isFailure(Schema.decodeResult(moviesResponseValidator)({ data: [movie({ radarrId: 1.5 })], total: 1 }))).toBe(true)
    })
  )
})
