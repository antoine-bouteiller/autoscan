import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test'

import { db } from '#/config/db'
import { media as mediaTable, type Media } from '#/database/schema'
import { setLanguageConversation } from '#/features/language_sync/commands/language.command'
import { type TelegramCallbackQuery, type TelegramMessageIn } from '#/integrations/telegram/telegram.validator'
import { type ConversationState } from '#/providers/telegram/types'
import { updateStreamMock } from '#tests/mocks/plex.mock'
import { answerCallbackQueryMock, editMessageTextMock, sendMessageMock } from '#tests/mocks/telegram.mock'
import { MockTelegramClient } from '#tests/utils'

const makeMessage = (chatId: number): TelegramMessageIn => ({
  chat: { id: chatId },
  message_id: 1,
})

const makeCallback = (data: string): TelegramCallbackQuery => ({ data, id: 'cb-1' })

const makeMedia = (count: number): Media[] =>
  Array.from({ length: count }, (_unused, index) => ({
    originalLanguage: 'en' as const,
    preferredLanguage: 'en' as const,
    title: `Media ${index + 1}`,
    tmdbId: index + 1,
    type: 'movie' as const,
  }))

describe('setLanguageConversation', () => {
  const client = new MockTelegramClient()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(async () => {
    await db.delete(mediaTable)
  })

  describe('onCommand', () => {
    test('should send prompt and return awaiting_media_type state', async () => {
      sendMessageMock.mockResolvedValueOnce(55)
      const state = await setLanguageConversation.onCommand(client, makeMessage(42))

      expect(sendMessageMock).toHaveBeenCalledWith(
        42,
        'What kind of media do you want to configure?',
        expect.objectContaining({ replyMarkup: expect.any(Object) })
      )
      expect(state).toEqual({ messageId: 55, step: 'awaiting_media_type' })
    })

    test('should return idle when sendMessage returns undefined', async () => {
      sendMessageMock.mockResolvedValueOnce(undefined)
      const state = await setLanguageConversation.onCommand(client, makeMessage(42))

      expect(state).toEqual({ step: 'idle' })
    })
  })

  describe('onCallback', () => {
    test('should answer callback query', async () => {
      await setLanguageConversation.onCallback(client, 1, {
        callback: makeCallback('movie'),
        state: { messageId: 42, step: 'awaiting_media_type' },
      })
      expect(answerCallbackQueryMock).toHaveBeenCalledWith('cb-1')
    })

    test('awaiting_media_type: should ignore unknown data', async () => {
      const initial: ConversationState = { messageId: 42, step: 'awaiting_media_type' }
      const state = await setLanguageConversation.onCallback(client, 1, { callback: makeCallback('noise'), state: initial })
      expect(state).toEqual(initial)
      expect(editMessageTextMock).not.toHaveBeenCalled()
    })

    test('awaiting_media_type: should transition to media selection for movie', async () => {
      await db.insert(mediaTable).values(makeMedia(3))
      const state = await setLanguageConversation.onCallback(client, 1, {
        callback: makeCallback('movie'),
        state: { messageId: 42, step: 'awaiting_media_type' },
      })
      expect(state).toEqual({ mediaType: 'movie', messageId: 42, page: 0, step: 'awaiting_media_selection' })
    })

    test('awaiting_media_selection: should navigate pages via page: prefix', async () => {
      await db.insert(mediaTable).values(makeMedia(15))
      const state = await setLanguageConversation.onCallback(client, 1, {
        callback: makeCallback('page:1'),
        state: { mediaType: 'movie', messageId: 42, page: 0, step: 'awaiting_media_selection' },
      })
      expect(state).toEqual({ mediaType: 'movie', messageId: 42, page: 1, step: 'awaiting_media_selection' })
    })

    test('awaiting_media_selection: should select media via select_media: prefix', async () => {
      await db.insert(mediaTable).values(makeMedia(3))
      const state = await setLanguageConversation.onCallback(client, 1, {
        callback: makeCallback('select_media:2'),
        state: { mediaType: 'movie', messageId: 42, page: 0, step: 'awaiting_media_selection' },
      })
      expect(state).toEqual({ mediaType: 'movie', messageId: 42, step: 'awaiting_language', tmdbId: 2 })
    })

    test('awaiting_language: should apply lang: selection', async () => {
      await db.insert(mediaTable).values(makeMedia(1))
      const state = await setLanguageConversation.onCallback(client, 1, {
        callback: makeCallback('lang:fr'),
        state: { mediaType: 'movie', messageId: 42, step: 'awaiting_language', tmdbId: 1 },
      })
      expect(state).toEqual({ step: 'idle' })
      expect(updateStreamMock).not.toHaveBeenCalled()
    })

    test('awaiting_language: should return state unchanged when data has unknown prefix', async () => {
      const initial: ConversationState = { mediaType: 'movie', messageId: 42, step: 'awaiting_language', tmdbId: 1 }
      const state = await setLanguageConversation.onCallback(client, 1, { callback: makeCallback('noise'), state: initial })
      expect(state).toEqual(initial)
    })
  })
})
