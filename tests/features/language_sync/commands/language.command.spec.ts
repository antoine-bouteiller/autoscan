import { beforeEach, describe, expect, test } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { runTest } from '@tests/effect'
import { answerCallbackQueryMock, editMessageTextMock, MockTelegramClient, sendMessageMock } from '@tests/utils'

import { media } from '@/database/schema'
import { setLanguageConversation } from '@/features/language_sync/commands/language.command'

const client = new MockTelegramClient()
const message = { chat: { id: 1 }, message_id: 1, text: '/setlanguage' }

describe('setLanguageConversation', () => {
  beforeEach(async () => {
    await db.delete(media)
    sendMessageMock.mockClear().mockResolvedValue(100)
    editMessageTextMock.mockClear()
    answerCallbackQueryMock.mockClear()
  })

  test('prompts for media type', async () => {
    expect(await runTest(setLanguageConversation.onCommand(client, message))).toEqual({ messageId: 100, step: 'awaiting_media_type' })
  })

  test('returns idle when the prompt fails', async () => {
    sendMessageMock.mockRejectedValueOnce(new Error('failed'))
    expect(await runTest(setLanguageConversation.onCommand(client, message))).toEqual({ step: 'idle' })
  })

  test('selects a media type', async () => {
    await db.insert(media).values({ originalLanguage: 'en', preferredLanguage: 'en', title: 'Movie', tmdbId: 1, type: 'movie' })
    const state = await runTest(
      setLanguageConversation.onCallback(client, 1, {
        callback: { data: 'movie', id: 'callback' },
        state: { messageId: 100, step: 'awaiting_media_type' },
      })
    )
    expect(state.step).toBe('awaiting_media_selection')
    expect(answerCallbackQueryMock).toHaveBeenCalledWith('callback')
  })

  test('ignores unknown callback data', async () => {
    const state = { messageId: 100, step: 'awaiting_media_type' } as const
    expect(await runTest(setLanguageConversation.onCallback(client, 1, { callback: { data: 'unknown', id: 'callback' }, state }))).toEqual(state)
  })
})
