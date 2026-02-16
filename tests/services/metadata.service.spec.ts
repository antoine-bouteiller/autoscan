import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest'
import { and, eq } from 'drizzle-orm'
import { Effect, Layer, ManagedRuntime } from 'effect'

import { DatabaseService } from '@/config/database'
import { media } from '@/database/schema'
import { MediaRepository } from '@/repositories/media.repository'
import { MetadataService, buildMediaTitle, extractTmdbIdFromPath } from '@/services/metadata.service'

import { MockAppConfigLayer } from '../mocks/app_config.mock'
import { MockPlexLayer } from '../mocks/plex.mock'
import { MockTmdbLayer, resetTmdbMock, tmdbCallCount, tmdbMediaMap } from '../mocks/tmdb.mock'
import { tmdbTvShowResponse } from '../resources/fixtures/tmdb.fixtures'

const InfraLayer = DatabaseService.DefaultWithoutDependencies.pipe(Layer.provide(MockAppConfigLayer))
const RepoLayer = MediaRepository.DefaultWithoutDependencies.pipe(Layer.provide(InfraLayer))

const TestLayer = MetadataService.DefaultWithoutDependencies.pipe(
  Layer.provide(MockPlexLayer),
  Layer.provide(MockTmdbLayer),
  Layer.provide(RepoLayer)
)

const FullLayer = Layer.mergeAll(TestLayer, InfraLayer)

const runtime = ManagedRuntime.make(FullLayer)

describe('MetadataService', () => {
  beforeEach(async () => {
    resetTmdbMock()
    await runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* DatabaseService
        yield* Effect.promise(() =>
          db.insert(media).values({
            originalLanguage: 'fr',
            preferredLanguage: 'fr',
            title: 'Cached Movie',
            tmdbId: 123,
            type: 'movie',
          })
        )
      })
    )
  })

  afterEach(() =>
    runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* DatabaseService
        yield* Effect.promise(() => db.delete(media))
      })
    )
  )

  describe('extractTmdbIdFromPath', () => {
    it('should extract TMDB ID from file path', () => {
      const result = extractTmdbIdFromPath('/path/to/{tmdb-12345}/movie.mkv')
      expect(result).toBe(12_345)
    })

    it('should return undefined if no TMDB ID found', () => {
      const result = extractTmdbIdFromPath('/path/to/movie.mkv')
      expect(result).toBeUndefined()
    })

    it('should handle various path formats', () => {
      expect(extractTmdbIdFromPath('/movies/{tmdb-999}/file.mp4')).toBe(999)
      expect(extractTmdbIdFromPath('{tmdb-1}/movie.mkv')).toBe(1)
      expect(extractTmdbIdFromPath('/path/{tmdb-123456789}/show.mkv')).toBe(123_456_789)
    })
  })

  describe('buildMediaTitle', () => {
    it('should build title from all parts', () => {
      const result = buildMediaTitle('Show Name', 'Season 1', 'Episode 1')
      expect(result).toBe('Show Name - Season 1 - Episode 1')
    })

    it('should handle missing parts', () => {
      expect(buildMediaTitle(undefined, undefined, 'Movie Title')).toBe('Movie Title')
      expect(buildMediaTitle('Show', undefined, 'Episode')).toBe('Show - Episode')
      expect(buildMediaTitle(undefined, 'Season', 'Episode')).toBe('Season - Episode')
    })

    it('should handle empty strings', () => {
      const result = buildMediaTitle('', '', 'Title')
      expect(result).toBe('Title')
    })
  })

  describe('getOriginalLanguage', () => {
    it('should return language from database cache if available', () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const metadata = yield* MetadataService
          const result = yield* metadata.getMediaLanguage(123, 'movie')
          expect(result.originalLanguage).toBe('fr')
          expect(tmdbCallCount).toBe(0)
        })
      ))

    it('should fetch from TMDB and persist if not in cache', async () => {
      tmdbMediaMap.set('456-show', tmdbTvShowResponse)

      await runtime.runPromise(
        Effect.gen(function* () {
          const metadata = yield* MetadataService
          const result = yield* metadata.getMediaLanguage(456, 'show')
          expect(result.originalLanguage).toBe('es')
          expect(tmdbCallCount).toBe(1)

          const db = yield* DatabaseService
          const cachedMedia = yield* Effect.promise(() =>
            db
              .select()
              .from(media)
              .where(and(eq(media.tmdbId, 456), eq(media.type, 'show')))
          )
          expect(cachedMedia).toHaveLength(1)
          expect(cachedMedia[0]).toMatchObject({
            originalLanguage: 'es',
            tmdbId: 456,
            type: 'show',
          })
        })
      )
    })

    it('should return en as fallback if TMDB fails', () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const metadata = yield* MetadataService
          const result = yield* metadata.getMediaLanguage(789, 'movie')
          expect(result.originalLanguage).toBe('en')
        })
      ))
  })

  describe('getCompleteMediaDetails', () => {
    it('should get complete details for a movie', () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const metadata = yield* MetadataService
          const result = yield* metadata.getCompleteMediaDetails(123)
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
      ))

    it('should get complete details for an episode', () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const metadata = yield* MetadataService
          const result = yield* metadata.getCompleteMediaDetails(234)
          expect(result).toMatchObject({
            file: '/path/to/{tmdb-67890}/S01E01.mkv',
            mediaTitle: 'Test Show - Season 1 - Episode 1',
            mediaType: 'show',
            partsId: 999,
            tmdbId: 67_890,
          })
        })
      ))

    it('should fail if no file found', () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const metadata = yield* MetadataService
          yield* metadata.getCompleteMediaDetails(345)
        }).pipe(
          Effect.flip,
          Effect.map((error) => expect(error).toBeDefined())
        )
      ))

    it('should fail if no TMDB ID found', () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const metadata = yield* MetadataService
          yield* metadata.getCompleteMediaDetails(567)
        }).pipe(
          Effect.flip,
          Effect.map((error) => expect(error).toBeDefined())
        )
      ))
  })
})
