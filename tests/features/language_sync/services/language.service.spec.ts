import { beforeEach, describe, expect, test } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { runTest } from '@tests/effect'
import { editMessageTextMock, MockPlexClient, MockTelegramClient, updateStreamMock } from '@tests/utils'

import { media } from '@/database/schema'
import {
  buildLanguageKeyboard,
  buildMediaKeyboard,
  buildMediaTypeKeyboard,
  handleUpdateLanguage,
  navigateMediaPage,
  selectLanguage,
  selectMedia,
  selectMediaType,
} from '@/features/language_sync/services/language.service'

const client = new MockTelegramClient()

const insertMedia = () => db.insert(media).values({ originalLanguage: 'en', preferredLanguage: 'en', title: 'Movie', tmdbId: 1, type: 'movie' })

describe('language service', () => {
  beforeEach(async () => {
    await db.delete(media)
    editMessageTextMock.mockClear()
    updateStreamMock.mockClear()
  })

  test('builds keyboards', () => {
    expect(buildMediaTypeKeyboard().inline_keyboard[0]).toHaveLength(2)
    expect(buildLanguageKeyboard().inline_keyboard.every((row) => row.length <= 6)).toBeTrue()
    expect(buildMediaKeyboard([], 0).inline_keyboard).toEqual([])
  })

  test('selectMediaType handles an empty library', async () => {
    const state = await runTest(selectMediaType(client, 1, { mediaType: 'movie', state: { messageId: 10, step: 'awaiting_media_type' } }))
    expect(state).toEqual({ step: 'idle' })
    expect(editMessageTextMock).toHaveBeenCalledWith(1, 10, { text: 'No media in movie library' })
  })

  test('selectMediaType and pagination render media', async () => {
    await insertMedia()
    const state = await runTest(selectMediaType(client, 1, { mediaType: 'movie', state: { messageId: 10, step: 'awaiting_media_type' } }))
    expect(state.step).toBe('awaiting_media_selection')
    const paged = await runTest(
      navigateMediaPage(client, 1, { page: 0, state: { mediaType: 'movie', messageId: 10, page: 0, step: 'awaiting_media_selection' } })
    )
    expect(paged.page).toBe(0)
  })

  test('selects media and language', async () => {
    await insertMedia()
    const selected = await runTest(
      selectMedia(client, 1, {
        state: { mediaType: 'movie', messageId: 10, page: 0, step: 'awaiting_media_selection' },
        tmdbId: 1,
      })
    )
    expect(selected.step).toBe('awaiting_language')
    await runTest(selectLanguage(client, 1, { lang: 'fr', state: { mediaType: 'movie', messageId: 10, step: 'awaiting_language', tmdbId: 1 } }))
    const rows = await db.select().from(media)
    expect(rows[0]?.preferredLanguage).toBe('fr')
  })

  test('updates selected Plex audio and French subtitles', async () => {
    await runTest(
      handleUpdateLanguage({
        mediaTitle: 'Movie',
        partsId: 2,
        preferredLanguage: 'fr',
        streams: [{ id: 3, languageCode: 'fra', selected: false, streamType: 2 }],
      }),
      { plex: new MockPlexClient() }
    )
    expect(updateStreamMock).toHaveBeenNthCalledWith(1, 2, 3, 'audio')
    expect(updateStreamMock).toHaveBeenNthCalledWith(2, 2, 0, 'subtitle')
  })

  test('does not update an already selected stream', async () => {
    await runTest(
      handleUpdateLanguage({
        mediaTitle: 'Movie',
        partsId: 2,
        preferredLanguage: 'en',
        streams: [{ id: 3, languageCode: 'eng', selected: true, streamType: 2 }],
      })
    )
    expect(updateStreamMock).not.toHaveBeenCalled()
  })
})
