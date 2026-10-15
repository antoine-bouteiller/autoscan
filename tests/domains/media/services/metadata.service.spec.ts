import { beforeEach } from 'bun:test'

import { testSql } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { MockPlexClient, MockTmdbClient } from '@tests/utils'
import { Effect } from 'effect'

import { FileNotFoundError, TmdbIdNotFoundError } from '@/domains/media/errors'
import { buildMediaTitle, extractTmdbIdFromPath, getCompleteMediaDetails, getMediaLanguage } from '@/domains/media/services/metadata.service'

describe('metadata service', () => {
  beforeEach(() => Effect.runPromise(Effect.promise(() => testSql`DELETE FROM media`)))

  it('extracts TMDB ids and titles', () => {
    expect(extractTmdbIdFromPath('/media/{tmdb-42}/file.mkv')).toBe(42)
    expect(extractTmdbIdFromPath('/media/file.mkv')).toBeUndefined()
    expect(buildMediaTitle('Show', 'Season', 'Episode')).toBe('Show - Season - Episode')
  })

  it.live('uses cached language', () =>
    Effect.gen(function* () {
      yield* Effect.promise(
        () => testSql`INSERT INTO media (original_language, preferred_language, title, tmdb_id, type) VALUES ('fr', 'en', 'Movie', 42, 'movie')`
      )
      expect(yield* provideTest(getMediaLanguage(42, 'movie'))).toEqual({ originalLanguage: 'fr', preferredLanguage: 'en' })
    })
  )

  it.live('fetches and caches TMDB language', () =>
    Effect.gen(function* () {
      const tmdb = new MockTmdbClient()
      tmdb.mediaMap.set('42-movie', { data: { original_language: 'fr', title: 'Film' }, type: 'movie' })
      expect(yield* provideTest(getMediaLanguage(42, 'movie'), { tmdb })).toEqual({ originalLanguage: 'fr', preferredLanguage: 'fr' })
      const rows = yield* Effect.promise(() => testSql<{ title: string }[]>`SELECT title FROM media`)
      expect(rows[0]?.title).toBe('Film')
    })
  )

  it.live('falls back to English when TMDB fails', () =>
    Effect.gen(function* () {
      expect(yield* provideTest(getMediaLanguage(42, 'movie'), { tmdb: new MockTmdbClient() })).toEqual({
        originalLanguage: 'en',
        preferredLanguage: 'en',
      })
    })
  )

  it.live('builds complete movie and episode details', () =>
    Effect.gen(function* () {
      const tmdb = new MockTmdbClient()
      tmdb.mediaMap.set('12345-movie', { data: { original_language: 'en', title: 'Movie' }, type: 'movie' })
      tmdb.mediaMap.set('67890-show', { data: { name: 'Show', original_language: 'fr' }, type: 'tv' })
      expect(yield* provideTest(getCompleteMediaDetails(123), { plex: new MockPlexClient(), tmdb })).toMatchObject({
        mediaType: 'movie',
        tmdbId: 12_345,
      })
      expect(yield* provideTest(getCompleteMediaDetails(234), { plex: new MockPlexClient(), tmdb })).toMatchObject({
        mediaType: 'show',
        tmdbId: 67_890,
      })
    })
  )

  it.live('fails for missing files and TMDB ids', () =>
    Effect.gen(function* () {
      expect(yield* Effect.flip(provideTest(getCompleteMediaDetails(345), { plex: new MockPlexClient() }))).toBeInstanceOf(FileNotFoundError)
      expect(yield* Effect.flip(provideTest(getCompleteMediaDetails(567), { plex: new MockPlexClient() }))).toBeInstanceOf(TmdbIdNotFoundError)
    })
  )
})
