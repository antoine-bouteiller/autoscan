import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test'

import { db } from '#config/db'
import { container, TOKENS } from '#core/container'
import { media } from '#database/schema'
import { FileNotFoundError, TmdbIdNotFoundError } from '#domains/media/errors'
import { isOk } from '#shared/utils/error'

import '../../../utils.ts'
import { type MockTmdbClient } from '../../../mocks/tmdb.mock.js'
import { tmdbTvShowResponse } from '../../../resources/fixtures/tmdb.fixtures.js'

const {
  buildMediaTitle,
  extractTmdbIdFromPath,
  getCompleteMediaDetails,
  getMediaLanguage: getOriginalLanguage,
} = await import('#domains/media/services/metadata.service')

describe('MetadataService', () => {
  let mockTmdbClient: MockTmdbClient

  beforeEach(async () => {
    container.reset()
    mockTmdbClient = container.resolve<MockTmdbClient>(TOKENS.TMDB_CLIENT)

    mockTmdbClient.reset()

    await db.insert(media).values({
      originalLanguage: 'fr',
      preferredLanguage: 'fr',
      title: 'Cached Movie',
      tmdbId: 123,
      type: 'movie',
    })
  })

  afterEach(async () => {
    await db.delete(media)
  })

  describe('extractTmdbIdFromPath', () => {
    test('should extract TMDB ID from file path', () => {
      const result = extractTmdbIdFromPath('/path/to/{tmdb-12345}/movie.mkv')
      expect(result).toBe(12_345)
    })

    test('should return undefined if no TMDB ID found', () => {
      const result = extractTmdbIdFromPath('/path/to/movie.mkv')
      expect(result).toBeUndefined()
    })

    test('should handle various path formats', () => {
      expect(extractTmdbIdFromPath('/movies/{tmdb-999}/file.mp4')).toBe(999)
      expect(extractTmdbIdFromPath('{tmdb-1}/movie.mkv')).toBe(1)
      expect(extractTmdbIdFromPath('/path/{tmdb-123456789}/show.mkv')).toBe(123_456_789)
    })
  })

  describe('buildMediaTitle', () => {
    test('should build title from all parts', () => {
      const result = buildMediaTitle('Show Name', 'Season 1', 'Episode 1')
      expect(result).toBe('Show Name - Season 1 - Episode 1')
    })

    test('should handle missing parts', () => {
      expect(buildMediaTitle(undefined, undefined, 'Movie Title')).toBe('Movie Title')
      expect(buildMediaTitle('Show', undefined, 'Episode')).toBe('Show - Episode')
      expect(buildMediaTitle(undefined, 'Season', 'Episode')).toBe('Season - Episode')
    })

    test('should handle empty strings', () => {
      const result = buildMediaTitle('', '', 'Title')
      expect(result).toBe('Title')
    })
  })

  describe('getOriginalLanguage', () => {
    test('should return language from database cache if available', async () => {
      const { originalLanguage } = await getOriginalLanguage(123, 'movie')

      expect(originalLanguage).toBe('fr')
      expect(mockTmdbClient.callCount).toBe(0)
    })

    test('should fetch from TMDB and persist if not in cache', async () => {
      mockTmdbClient.mediaMap.set('456-show', tmdbTvShowResponse)

      const { originalLanguage } = await getOriginalLanguage(456, 'show')

      expect(originalLanguage).toBe('es')
      expect(mockTmdbClient.callCount).toBe(1)

      const cachedMedia = await db
        .select()
        .from(media)
        .where(and(eq(media.tmdbId, 456), eq(media.type, 'show')))

      expect(cachedMedia).toHaveLength(1)
      expect(cachedMedia[0]).toMatchObject({
        originalLanguage: 'es',
        tmdbId: 456,
        type: 'show',
      })
    })

    test('should return en as fallback if TMDB fails', async () => {
      const { originalLanguage } = await getOriginalLanguage(789, 'movie')

      expect(originalLanguage).toBe('en')
    })
  })

  describe('getCompleteMediaDetails', () => {
    test('should get complete details for a movie', async () => {
      const result = await getCompleteMediaDetails(123)

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) {
        return
      }
      expect(result).toMatchObject({
        file: '/path/to/{tmdb-12345}/movie.mkv',
        mediaTitle: 'Test Movie',
        mediaType: 'movie',
        partsId: 456,
        tmdbId: 12_345,
      })
      expect(result.originalLanguage).toBeDefined()
      expect(result.streams).toBeDefined()
    })

    test('should get complete details for an episode', async () => {
      const result = await getCompleteMediaDetails(234)

      expect(result).toMatchObject({
        file: '/path/to/{tmdb-67890}/S01E01.mkv',
        mediaTitle: 'Test Show - Season 1 - Episode 1',
        mediaType: 'show',
        partsId: 999,
        tmdbId: 67_890,
      })
    })

    test('should return FileNotFoundError if no file found', async () => {
      const result = await getCompleteMediaDetails(345)
      expect(result).toBeInstanceOf(FileNotFoundError)
    })

    test('should return TmdbIdNotFoundError if no TMDB ID found', async () => {
      const result = await getCompleteMediaDetails(567)
      expect(result).toBeInstanceOf(TmdbIdNotFoundError)
    })
  })
})
