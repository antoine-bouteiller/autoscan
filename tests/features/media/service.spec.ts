import { afterEach, describe, expect, test } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { db } from '@/config/db'
import { media, type Media } from '@/database/schema'
import {
  countMediaByType,
  createdOrUpdatedMedia,
  getMediaByIdAndType,
  getMediaByTypeWithPagination,
} from '@/features/media'

describe('MediaService', () => {
  afterEach(async () => {
    await db.delete(media)
  })
  describe('countMediaByType', () => {
    test('should return count of movies', async () => {
      await db.insert(media).values([
        {
          originalLanguage: 'en',
          preferredLanguage: 'en',
          title: 'Movie 1',
          tmdbId: 1,
          type: 'movie',
        },
        {
          originalLanguage: 'en',
          preferredLanguage: 'en',
          title: 'Movie 2',
          tmdbId: 2,
          type: 'movie',
        },
        {
          originalLanguage: 'fr',
          preferredLanguage: 'fr',
          title: 'Movie 3',
          tmdbId: 3,
          type: 'movie',
        },
        {
          originalLanguage: 'en',
          preferredLanguage: 'en',
          title: 'Movie 4',
          tmdbId: 4,
          type: 'movie',
        },
        {
          originalLanguage: 'es',
          preferredLanguage: 'es',
          title: 'Movie 5',
          tmdbId: 5,
          type: 'movie',
        },
        {
          originalLanguage: 'en',
          preferredLanguage: 'en',
          title: 'Show 1',
          tmdbId: 1,
          type: 'show',
        },
      ])

      const result = await countMediaByType('movie')

      expect(result[0]?.count).toBe(5)
    })

    test('should return count of shows', async () => {
      await db.insert(media).values([
        {
          originalLanguage: 'en',
          preferredLanguage: 'en',
          title: 'Show 1',
          tmdbId: 1,
          type: 'show',
        },
        {
          originalLanguage: 'fr',
          preferredLanguage: 'fr',
          title: 'Show 2',
          tmdbId: 2,
          type: 'show',
        },
        {
          originalLanguage: 'en',
          preferredLanguage: 'en',
          title: 'Show 3',
          tmdbId: 3,
          type: 'show',
        },
        {
          originalLanguage: 'en',
          preferredLanguage: 'en',
          title: 'Movie 1',
          tmdbId: 1,
          type: 'movie',
        },
      ])

      const result = await countMediaByType('show')

      expect(result[0]?.count).toBe(3)
    })
  })

  describe('createdOrUpdatedMedia', () => {
    test('should insert new media', async () => {
      await createdOrUpdatedMedia(123, 'movie', 'Test Movie', 'en')

      const result = await db
        .select()
        .from(media)
        .where(and(eq(media.tmdbId, 123), eq(media.type, 'movie')))

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        originalLanguage: 'en',
        title: 'Test Movie',
        tmdbId: 123,
        type: 'movie',
      })
    })

    test('should update existing media', async () => {
      await db.insert(media).values({
        originalLanguage: 'en',
        preferredLanguage: 'en',
        title: 'Old Title',
        tmdbId: 456,
        type: 'show',
      })

      await createdOrUpdatedMedia(456, 'show', 'Test Show', 'fr')

      const result = await db
        .select()
        .from(media)
        .where(and(eq(media.tmdbId, 456), eq(media.type, 'show')))

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        originalLanguage: 'fr',
        preferredLanguage: 'fr',
        title: 'Test Show',
        tmdbId: 456,
        type: 'show',
      })
    })
  })

  describe('getMediaByIdAndType', () => {
    test('should return media by id and type', async () => {
      await db.insert(media).values({
        originalLanguage: 'en',
        preferredLanguage: 'en',
        title: 'Test Movie',
        tmdbId: 123,
        type: 'movie',
      })

      const result = await getMediaByIdAndType(123, 'movie')

      expect(result).toMatchObject({
        originalLanguage: 'en',
        title: 'Test Movie',
        tmdbId: 123,
        type: 'movie',
      })
    })

    test('should return undefined if media not found', async () => {
      const result = await getMediaByIdAndType(999, 'movie')

      expect(result).toBeUndefined()
    })
  })

  describe('getMediaByTypeWithPagination', () => {
    test('should return paginated movies', async () => {
      // Insert test data
      await db.insert(media).values([
        {
          originalLanguage: 'en',
          preferredLanguage: 'en',
          title: 'A Movie',
          tmdbId: 1,
          type: 'movie',
        },
        {
          originalLanguage: 'en',
          preferredLanguage: 'en',
          title: 'B Movie',
          tmdbId: 2,
          type: 'movie',
        },
        {
          originalLanguage: 'fr',
          preferredLanguage: 'fr',
          title: 'C Movie',
          tmdbId: 3,
          type: 'movie',
        },
        {
          originalLanguage: 'en',
          preferredLanguage: 'en',
          title: 'Show 1',
          tmdbId: 4,
          type: 'show',
        },
      ])

      const result = await getMediaByTypeWithPagination('movie', 0, 10)

      expect(result).toHaveLength(3)
      expect(result[0]?.title).toBe('A Movie')
      expect(result[1]?.title).toBe('B Movie')
      expect(result[2]?.title).toBe('C Movie')
    })

    test('should return second page of shows', async () => {
      const shows: Media[] = Array.from({ length: 15 }, (_, i) => ({
        originalLanguage: 'en',
        preferredLanguage: 'en',
        title: `Show ${String(i + 1).padStart(2, '0')}`,
        tmdbId: i + 1,
        type: 'show',
      }))
      await db.insert(media).values(shows)

      const result = await getMediaByTypeWithPagination('show', 1, 10)

      expect(result).toHaveLength(5)
      expect(result[0]?.title).toBe('Show 11')
    })

    test('should handle custom page sizes', async () => {
      const movies: Media[] = Array.from({ length: 75 }, (_, i) => ({
        originalLanguage: 'en',
        preferredLanguage: 'en',
        title: `Movie ${String(i + 1).padStart(2, '00')}`,
        tmdbId: i + 1,
        type: 'movie',
      }))
      await db.insert(media).values(movies)

      const result = await getMediaByTypeWithPagination('movie', 2, 25)

      expect(result).toHaveLength(25)
      expect(result[0]?.title).toBe('Movie 51')
    })
  })
})
