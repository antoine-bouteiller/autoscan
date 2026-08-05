import { beforeEach, describe, expect, test } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { runTest } from '@tests/effect'
import { MockPlexClient, MockTmdbClient } from '@tests/utils'

import { media } from '@/database/schema'
import { FileNotFoundError, TmdbIdNotFoundError } from '@/domains/media/errors'
import { buildMediaTitle, extractTmdbIdFromPath, getCompleteMediaDetails, getMediaLanguage } from '@/domains/media/services/metadata.service'

describe('metadata service', () => {
  beforeEach(async () => {
    await db.delete(media)
  })

  test('extracts TMDB ids and titles', () => {
    expect(extractTmdbIdFromPath('/media/{tmdb-42}/file.mkv')).toBe(42)
    expect(extractTmdbIdFromPath('/media/file.mkv')).toBeUndefined()
    expect(buildMediaTitle('Show', 'Season', 'Episode')).toBe('Show - Season - Episode')
  })

  test('uses cached language', async () => {
    await db.insert(media).values({ originalLanguage: 'fr', preferredLanguage: 'en', title: 'Movie', tmdbId: 42, type: 'movie' })
    expect(await runTest(getMediaLanguage(42, 'movie'))).toEqual({ originalLanguage: 'fr', preferredLanguage: 'en' })
  })

  test('fetches and caches TMDB language', async () => {
    const tmdb = new MockTmdbClient()
    tmdb.mediaMap.set('42-movie', { data: { original_language: 'fr', title: 'Film' }, type: 'movie' })
    expect(await runTest(getMediaLanguage(42, 'movie'), { tmdb })).toEqual({ originalLanguage: 'fr', preferredLanguage: 'fr' })
    const rows = await db.select().from(media)
    expect(rows[0]?.title).toBe('Film')
  })

  test('falls back to English when TMDB fails', async () => {
    expect(await runTest(getMediaLanguage(42, 'movie'), { tmdb: new MockTmdbClient() })).toEqual({
      originalLanguage: 'en',
      preferredLanguage: 'en',
    })
  })

  test('builds complete movie and episode details', async () => {
    const tmdb = new MockTmdbClient()
    tmdb.mediaMap.set('12345-movie', { data: { original_language: 'en', title: 'Movie' }, type: 'movie' })
    tmdb.mediaMap.set('67890-show', { data: { name: 'Show', original_language: 'fr' }, type: 'tv' })
    expect(await runTest(getCompleteMediaDetails(123), { plex: new MockPlexClient(), tmdb })).toMatchObject({ mediaType: 'movie', tmdbId: 12_345 })
    expect(await runTest(getCompleteMediaDetails(234), { plex: new MockPlexClient(), tmdb })).toMatchObject({ mediaType: 'show', tmdbId: 67_890 })
  })

  test('fails for missing files and TMDB ids', async () => {
    expect(await runTest(getCompleteMediaDetails(345), { plex: new MockPlexClient() }).catch((error) => error)).toBeInstanceOf(FileNotFoundError)
    expect(await runTest(getCompleteMediaDetails(567), { plex: new MockPlexClient() }).catch((error) => error)).toBeInstanceOf(TmdbIdNotFoundError)
  })
})
