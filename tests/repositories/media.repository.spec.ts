import { afterEach, describe, expect, it } from '@effect/vitest'
import { and, eq } from 'drizzle-orm'
import { Effect, Layer, ManagedRuntime } from 'effect'

import { DatabaseService } from '@/config/database'
import { media } from '@/database/schema'
import { MediaRepository } from '@/repositories/media.repository'

import { MockAppConfigLayer } from '../mocks/app_config.mock'

const InfraLayer = DatabaseService.DefaultWithoutDependencies.pipe(Layer.provide(MockAppConfigLayer))
const TestLayer = Layer.mergeAll(MediaRepository.DefaultWithoutDependencies.pipe(Layer.provide(InfraLayer)), InfraLayer)

const runtime = ManagedRuntime.make(TestLayer)

describe('MediaService', () => {
  afterEach(() =>
    runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* DatabaseService
        yield* Effect.promise(() => db.delete(media))
      })
    )
  )

  describe('countMediaByType', () => {
    it('should return count of movies', () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const db = yield* DatabaseService
          yield* Effect.promise(() =>
            db.insert(media).values([
              { originalLanguage: 'en', preferredLanguage: 'en', title: 'Movie 1', tmdbId: 1, type: 'movie' },
              { originalLanguage: 'en', preferredLanguage: 'en', title: 'Movie 2', tmdbId: 2, type: 'movie' },
              { originalLanguage: 'fr', preferredLanguage: 'fr', title: 'Movie 3', tmdbId: 3, type: 'movie' },
              { originalLanguage: 'en', preferredLanguage: 'en', title: 'Movie 4', tmdbId: 4, type: 'movie' },
              { originalLanguage: 'es', preferredLanguage: 'es', title: 'Movie 5', tmdbId: 5, type: 'movie' },
              { originalLanguage: 'en', preferredLanguage: 'en', title: 'Show 1', tmdbId: 1, type: 'show' },
            ])
          )
          const repo = yield* MediaRepository
          const result = yield* repo.countMediaByType('movie')
          expect(result).toBe(5)
        })
      ))
  })

  describe('createdOrUpdatedMedia', () => {
    it('should insert new media', () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const repo = yield* MediaRepository
          yield* repo.createOrUpdateMedia(123, 'movie', 'Test Movie', 'en')
          const db = yield* DatabaseService
          const result = yield* Effect.promise(() =>
            db
              .select()
              .from(media)
              .where(and(eq(media.tmdbId, 123), eq(media.type, 'movie')))
          )
          expect(result).toHaveLength(1)
          expect(result[0]).toMatchObject({
            originalLanguage: 'en',
            title: 'Test Movie',
            tmdbId: 123,
            type: 'movie',
          })
        })
      ))

    it('should update existing media', () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const db = yield* DatabaseService
          yield* Effect.promise(() =>
            db.insert(media).values({
              originalLanguage: 'en',
              preferredLanguage: 'en',
              title: 'Old Title',
              tmdbId: 456,
              type: 'show',
            })
          )
          const repo = yield* MediaRepository
          yield* repo.createOrUpdateMedia(456, 'show', 'Test Show', 'fr')
          const result = yield* Effect.promise(() =>
            db
              .select()
              .from(media)
              .where(and(eq(media.tmdbId, 456), eq(media.type, 'show')))
          )
          expect(result).toHaveLength(1)
          expect(result[0]).toMatchObject({
            originalLanguage: 'fr',
            preferredLanguage: 'fr',
            title: 'Test Show',
            tmdbId: 456,
            type: 'show',
          })
        })
      ))
  })

  describe('getMediaByIdAndType', () => {
    it('should return media by id and type', () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const db = yield* DatabaseService
          yield* Effect.promise(() =>
            db.insert(media).values({
              originalLanguage: 'en',
              preferredLanguage: 'en',
              title: 'Test Movie',
              tmdbId: 123,
              type: 'movie',
            })
          )
          const repo = yield* MediaRepository
          const result = yield* repo.getMediaByIdAndType(123, 'movie')
          expect(result).toMatchObject({
            originalLanguage: 'en',
            title: 'Test Movie',
            tmdbId: 123,
            type: 'movie',
          })
        })
      ))

    it('should return undefined if media not found', () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const repo = yield* MediaRepository
          const result = yield* repo.getMediaByIdAndType(999, 'movie')
          expect(result).toBeUndefined()
        })
      ))
  })

  describe('getMediaByTypeWithPagination', () => {
    it('should return paginated movies', () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const db = yield* DatabaseService
          yield* Effect.promise(() =>
            db.insert(media).values([
              { originalLanguage: 'en', preferredLanguage: 'en', title: 'A Movie', tmdbId: 1, type: 'movie' },
              { originalLanguage: 'en', preferredLanguage: 'en', title: 'B Movie', tmdbId: 2, type: 'movie' },
              { originalLanguage: 'fr', preferredLanguage: 'fr', title: 'C Movie', tmdbId: 3, type: 'movie' },
              { originalLanguage: 'en', preferredLanguage: 'en', title: 'Show 1', tmdbId: 4, type: 'show' },
            ])
          )
          const repo = yield* MediaRepository
          const result = yield* repo.getMediaByTypeWithPagination('movie', 0, 10)
          expect(result).toHaveLength(3)
          expect(result[0]?.title).toBe('A Movie')
          expect(result[1]?.title).toBe('B Movie')
          expect(result[2]?.title).toBe('C Movie')
        })
      ))
  })
})
