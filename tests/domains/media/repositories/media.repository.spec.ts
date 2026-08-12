import { beforeEach } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { Effect } from 'effect'

import { media } from '@/database/schema'
import {
  countMediaByType,
  createdOrUpdatedMedia,
  getMediaByIdAndType,
  getMediaByTypeWithPagination,
} from '@/domains/media/repositories/media.repository'

describe('media repository', () => {
  beforeEach(async () => {
    await db.delete(media)
  })

  it.live('creates and updates media', () =>
    Effect.gen(function* () {
      yield* provideTest(createdOrUpdatedMedia({ originalLanguage: 'en', title: 'Movie', tmdbId: 1, type: 'movie' }))
      yield* provideTest(createdOrUpdatedMedia({ originalLanguage: 'fr', title: 'Film', tmdbId: 1, type: 'movie' }))

      expect(yield* provideTest(getMediaByIdAndType(1, 'movie'))).toMatchObject({
        originalLanguage: 'fr',
        preferredLanguage: 'fr',
        title: 'Film',
      })
    })
  )

  it.live('returns undefined for missing media', () =>
    Effect.gen(function* () {
      expect(yield* provideTest(getMediaByIdAndType(99, 'show'))).toBeUndefined()
    })
  )

  it.live('counts media by type', () =>
    Effect.gen(function* () {
      yield* provideTest(createdOrUpdatedMedia({ originalLanguage: 'en', title: 'A', tmdbId: 1, type: 'movie' }))
      yield* provideTest(createdOrUpdatedMedia({ originalLanguage: 'en', title: 'B', tmdbId: 2, type: 'movie' }))
      const counts = yield* provideTest(countMediaByType('movie'))
      expect(counts[0]?.count).toBe(2)
    })
  )

  it.live('paginates in title order', () =>
    Effect.gen(function* () {
      yield* provideTest(createdOrUpdatedMedia({ originalLanguage: 'en', title: 'B', tmdbId: 2, type: 'show' }))
      yield* provideTest(createdOrUpdatedMedia({ originalLanguage: 'en', title: 'A', tmdbId: 1, type: 'show' }))
      const firstPage = yield* provideTest(getMediaByTypeWithPagination('show', 0, 1))
      const secondPage = yield* provideTest(getMediaByTypeWithPagination('show', 1, 1))
      expect(firstPage[0]?.title).toBe('A')
      expect(secondPage[0]?.title).toBe('B')
    })
  )
})
