import { beforeEach } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { provideTest } from '@tests/effect'
import { testEnv } from '@tests/env'
import { describe, expect, it } from '@tests/it'
import { editMessageTextMock, MockPlexClient, MockTelegramClient, sendMessageMock, updateStreamMock } from '@tests/utils'
import { Cause, Effect, Exit } from 'effect'

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
import { type ITelegramClient } from '@/integrations/telegram/telegram.service'

const client = new MockTelegramClient()

class InterruptingTelegramClient extends MockTelegramClient {
  override sendMessage(_chatId: number, _text: string, _options?: Parameters<ITelegramClient['sendMessage']>[2]) {
    return Effect.interrupt
  }
}

const insertMedia = () =>
  Effect.promise(() => db.insert(media).values({ originalLanguage: 'en', preferredLanguage: 'en', title: 'Movie', tmdbId: 1, type: 'movie' }))

describe('language service', () => {
  beforeEach(() =>
    Effect.runPromise(
      Effect.gen(function* () {
        yield* Effect.promise(() => db.delete(media))
        editMessageTextMock.mockClear()
        sendMessageMock.mockReset().mockResolvedValue(100)
        updateStreamMock.mockClear()
      })
    )
  )

  it('builds keyboards', () => {
    expect(buildMediaTypeKeyboard().inline_keyboard[0]).toHaveLength(2)
    expect(buildLanguageKeyboard().inline_keyboard.every((row) => row.length <= 6)).toBeTrue()
    expect(buildMediaKeyboard([], 0).inline_keyboard).toEqual([])
  })

  it.live('selectMediaType handles an empty library', () =>
    Effect.gen(function* () {
      const state = yield* provideTest(selectMediaType(client, 1, { mediaType: 'movie', state: { messageId: 10, step: 'awaiting_media_type' } }))
      expect(state).toEqual({ step: 'idle' })
      expect(editMessageTextMock).toHaveBeenCalledWith(1, 10, { text: 'No media in movie library' })
    })
  )

  it.live('selectMediaType and pagination render media', () =>
    Effect.gen(function* () {
      yield* insertMedia()
      const state = yield* provideTest(selectMediaType(client, 1, { mediaType: 'movie', state: { messageId: 10, step: 'awaiting_media_type' } }))
      expect(state.step).toBe('awaiting_media_selection')
      const paged = yield* provideTest(
        navigateMediaPage(client, 1, { page: 0, state: { mediaType: 'movie', messageId: 10, page: 0, step: 'awaiting_media_selection' } })
      )
      expect(paged.page).toBe(0)
    })
  )

  it.live('selects media and language', () =>
    Effect.gen(function* () {
      yield* insertMedia()
      const selected = yield* provideTest(
        selectMedia(client, 1, {
          state: { mediaType: 'movie', messageId: 10, page: 0, step: 'awaiting_media_selection' },
          tmdbId: 1,
        })
      )
      expect(selected.step).toBe('awaiting_language')
      yield* provideTest(
        selectLanguage(client, 1, { lang: 'fr', state: { mediaType: 'movie', messageId: 10, step: 'awaiting_language', tmdbId: 1 } })
      )
      const rows = yield* Effect.promise(() => db.select().from(media))
      expect(rows[0]?.preferredLanguage).toBe('fr')
    })
  )

  it.live('updates selected Plex audio and French subtitles', () =>
    Effect.gen(function* () {
      yield* provideTest(
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
      expect(sendMessageMock).not.toHaveBeenCalled()
    })
  )

  it.live('notifies Telegram when the preferred audio stream is missing', () =>
    Effect.gen(function* () {
      yield* provideTest(
        handleUpdateLanguage({
          mediaTitle: 'Movie',
          partsId: 2,
          preferredLanguage: 'fr',
          streams: [{ id: 3, languageCode: 'eng', selected: false, streamType: 2 }],
        })
      )
      expect(sendMessageMock.mock.calls).toEqual([[testEnv.TELEGRAM_CHAT_ID, 'No fr audio stream found for Movie', undefined]])
      expect(updateStreamMock).not.toHaveBeenCalled()
    })
  )

  it.live('continues when the missing-audio notification fails', () =>
    Effect.gen(function* () {
      sendMessageMock.mockRejectedValueOnce(new Error('Telegram unavailable'))
      expect(yield* provideTest(handleUpdateLanguage({ mediaTitle: 'Movie', partsId: 2, preferredLanguage: 'fr', streams: [] }))).toBeUndefined()
    })
  )

  it.live('preserves interruption from the missing-audio notification', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        provideTest(handleUpdateLanguage({ mediaTitle: 'Movie', partsId: 2, preferredLanguage: 'fr', streams: [] }), {
          telegram: new InterruptingTelegramClient(),
        })
      )
      expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBeTrue()
    })
  )

  it.live('does not update an already selected stream', () =>
    Effect.gen(function* () {
      yield* provideTest(
        handleUpdateLanguage({
          mediaTitle: 'Movie',
          partsId: 2,
          preferredLanguage: 'en',
          streams: [{ id: 3, languageCode: 'eng', selected: true, streamType: 2 }],
        })
      )
      expect(updateStreamMock).not.toHaveBeenCalled()
      expect(sendMessageMock).not.toHaveBeenCalled()
    })
  )
})
