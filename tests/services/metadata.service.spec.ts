import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { db } from '@/config/db'
import { container, TOKENS } from '@/core/container'
import { media } from '@/database/schema'

import '../config'
import type { TestPlexClient, TestTmdbClient } from '../mocks'

import { mockPlexEpisode, mockPlexMovie, mockPlexMovieResponse } from '../resources/fixtures/plex.fixtures'
import { tmdbTvShowResponse } from '../resources/fixtures/tmdb.fixtures'

const {
  buildMediaTitle,
  extractTmdbIdFromPath,
  getCompleteMediaDetails,
  getMediaLanguage: getOriginalLanguage,
} = await import('@/services/metadata.service')

describe('MetadataService', () => {
  let testPlexClient: TestPlexClient
  let testTmdbClient: TestTmdbClient

  beforeEach(async () => {
    container.reset()
    testPlexClient = container.resolve<TestPlexClient>(TOKENS.PLEX_CLIENT)
    testTmdbClient = container.resolve<TestTmdbClient>(TOKENS.TMDB_CLIENT)

    await db.insert(media).values({
      originalLanguage: 'fr',
      preferredLanguage: 'fr',
      title: 'Cached Movie',
      tmdbId: 123,
      type: 'movie',
    })

    testPlexClient.getPlexMetadata.mockReset()
    testTmdbClient.getTmdbMedia.mockClear()
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
      expect(testTmdbClient.getTmdbMedia).not.toHaveBeenCalled()
    })

    test('should fetch from TMDB and persist if not in cache', async () => {
      testTmdbClient.getTmdbMedia.mockResolvedValueOnce(tmdbTvShowResponse)

      const { originalLanguage } = await getOriginalLanguage(456, 'show')

      expect(originalLanguage).toBe('es')
      expect(testTmdbClient.getTmdbMedia).toHaveBeenCalled()

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
      testTmdbClient.getTmdbMedia.mockResolvedValueOnce({
        data: undefined,
        type: 'movie',
      })

      const { originalLanguage } = await getOriginalLanguage(789, 'movie')

      expect(originalLanguage).toBe('en')
    })
  })

  describe('getCompleteMediaDetails', () => {
    test('should get complete details for a movie', async () => {
      testTmdbClient.getTmdbMedia.mockResolvedValueOnce({
        data: undefined,
        type: 'movie',
      })
      testPlexClient.getPlexMetadata.mockResolvedValue(mockPlexMovieResponse.MediaContainer.Metadata?.[0])

      const result = await getCompleteMediaDetails(mockPlexMovie)

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
      testTmdbClient.getTmdbMedia.mockResolvedValueOnce({
        data: undefined,
        type: 'movie',
      })
      testPlexClient.getPlexMetadata.mockResolvedValue({
        Media: [
          {
            Part: [
              {
                id: 999,
                Stream: [],
              },
            ],
          },
        ],
      })

      const result = await getCompleteMediaDetails(mockPlexEpisode)

      expect(result).toMatchObject({
        file: '/path/to/{tmdb-67890}/S01E01.mkv',
        mediaTitle: 'Test Show - Season 1 - Episode 1',
        mediaType: 'show',
        partsId: 999,
        tmdbId: 67_890,
      })
    })

    test('should throw error if no file found', async () => {
      const plexMediaNoFile = {
        ...mockPlexMovie,
        Media: [],
      }

      expect(getCompleteMediaDetails(plexMediaNoFile)).rejects.toThrow('No file found')
    })

    test('should throw error if no TMDB ID found', async () => {
      const plexMediaNoTmdb = {
        ...mockPlexMovie,
        Media: [
          {
            Part: [
              {
                file: '/path/without/tmdb/movie.mkv',
                id: 456,
                Stream: [],
              },
            ],
          },
        ],
      }

      expect(getCompleteMediaDetails(plexMediaNoTmdb)).rejects.toThrow('No tmdbId found')
    })

    test('should throw error if no part found in Plex metadata', async () => {
      testTmdbClient.getTmdbMedia.mockResolvedValueOnce({
        data: undefined,
        type: 'movie',
      })
      testPlexClient.getPlexMetadata.mockResolvedValue({
        Media: [],
      })

      expect(getCompleteMediaDetails(mockPlexMovie)).rejects.toThrow('No part found in Plex metadata')
    })
  })
})
