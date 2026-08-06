import { beforeEach, describe, expect, test } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { runTest } from '@tests/effect'

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

  test('creates and updates media', async () => {
    await runTest(createdOrUpdatedMedia({ originalLanguage: 'en', title: 'Movie', tmdbId: 1, type: 'movie' }))
    await runTest(createdOrUpdatedMedia({ originalLanguage: 'fr', title: 'Film', tmdbId: 1, type: 'movie' }))

    expect(await runTest(getMediaByIdAndType(1, 'movie'))).toMatchObject({
      originalLanguage: 'fr',
      preferredLanguage: 'fr',
      title: 'Film',
    })
  })

  test('returns undefined for missing media', async () => {
    expect(await runTest(getMediaByIdAndType(99, 'show'))).toBeUndefined()
  })

  test('counts media by type', async () => {
    await runTest(createdOrUpdatedMedia({ originalLanguage: 'en', title: 'A', tmdbId: 1, type: 'movie' }))
    await runTest(createdOrUpdatedMedia({ originalLanguage: 'en', title: 'B', tmdbId: 2, type: 'movie' }))
    const counts = await runTest(countMediaByType('movie'))
    expect(counts[0]?.count).toBe(2)
  })

  test('paginates in title order', async () => {
    await runTest(createdOrUpdatedMedia({ originalLanguage: 'en', title: 'B', tmdbId: 2, type: 'show' }))
    await runTest(createdOrUpdatedMedia({ originalLanguage: 'en', title: 'A', tmdbId: 1, type: 'show' }))
    const firstPage = await runTest(getMediaByTypeWithPagination('show', 0, 1))
    const secondPage = await runTest(getMediaByTypeWithPagination('show', 1, 1))
    expect(firstPage[0]?.title).toBe('A')
    expect(secondPage[0]?.title).toBe('B')
  })
})
