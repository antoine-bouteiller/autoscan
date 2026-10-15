import { beforeEach } from 'bun:test'

import { testSql } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { answerCallbackQueryMock, editMessageTextMock, MockTelegramClient, sendMessageMock } from '@tests/utils'
import { Effect } from 'effect'

import { setLanguageConversation } from '@/features/language_sync/commands/language.command'

const client = new MockTelegramClient()
const message = { chat: { id: 1 }, message_id: 1, text: '/setlanguage' }

describe('setLanguageConversation', () => {
  beforeEach(() =>
    Effect.runPromise(
      Effect.gen(function* () {
        yield* Effect.promise(() => testSql`DELETE FROM media`)
        sendMessageMock.mockClear().mockResolvedValue(100)
        editMessageTextMock.mockClear()
        answerCallbackQueryMock.mockClear()
      })
    )
  )

  it.live('prompts for media type', () =>
    Effect.gen(function* () {
      expect(yield* provideTest(setLanguageConversation.onCommand(client, message))).toEqual({ messageId: 100, step: 'awaiting_media_type' })
    })
  )

  it.live('returns idle when the prompt fails', () =>
    Effect.gen(function* () {
      sendMessageMock.mockRejectedValueOnce(new Error('failed'))
      expect(yield* provideTest(setLanguageConversation.onCommand(client, message))).toEqual({ step: 'idle' })
    })
  )

  it.live('selects a media type', () =>
    Effect.gen(function* () {
      yield* Effect.promise(
        () => testSql`INSERT INTO media (original_language, preferred_language, title, tmdb_id, type) VALUES ('en', 'en', 'Movie', 1, 'movie')`
      )
      const state = yield* provideTest(
        setLanguageConversation.onCallback(client, 1, {
          callback: { data: 'movie', id: 'callback' },
          state: { messageId: 100, step: 'awaiting_media_type' },
        })
      )
      expect(state.step).toBe('awaiting_media_selection')
      expect(answerCallbackQueryMock).toHaveBeenCalledWith('callback')
    })
  )

  it.live('ignores unknown callback data', () =>
    Effect.gen(function* () {
      const state = { messageId: 100, step: 'awaiting_media_type' } as const
      expect(yield* provideTest(setLanguageConversation.onCallback(client, 1, { callback: { data: 'unknown', id: 'callback' }, state }))).toEqual(
        state
      )
    })
  )
})
