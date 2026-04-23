import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'

import { db } from '#/config/db'
import { traktSyncHistory, traktTokens } from '#/database/schema'
import { syncTraktCommand, traktAuthCommand } from '#/features/trakt_sync/commands/trakt.command'
import { type TelegramMessageIn } from '#/integrations/telegram/telegram.validator'
import { HttpError } from '#/shared/errors/http'

import { sendMessageMock } from '../../../mocks/telegram.mock.js'
import { getDeviceCodeMock, syncWatchedHistoryMock } from '../../../mocks/trakt.mock.js'
import { MockTelegramClient } from '../../../utils.ts'

const makeMessage = (chatId: number): TelegramMessageIn => ({
  chat: { id: chatId },
  from: { id: 1, is_bot: false },
  message_id: 1,
  text: '/trakt',
})

describe('traktAuthCommand', () => {
  const client = new MockTelegramClient()

  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete(traktTokens)
  })

  test('should reply "Already authentified" when a valid token exists', async () => {
    await db.insert(traktTokens).values({
      accessToken: 'valid',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      refreshToken: 'refresh',
    })

    const state = await traktAuthCommand(client, makeMessage(42))

    expect(state).toEqual({ step: 'idle' })
    expect(sendMessageMock).toHaveBeenCalledWith(42, 'Already authentified.')
    expect(getDeviceCodeMock).not.toHaveBeenCalled()
  })

  test('should reply with failure when getDeviceCode errors', async () => {
    getDeviceCodeMock.mockResolvedValue(new HttpError({ body: 'bad', route: 'oauth', serviceName: 'Trakt', status: 500 }))

    const state = await traktAuthCommand(client, makeMessage(42))

    expect(state).toEqual({ step: 'idle' })
    expect(sendMessageMock).toHaveBeenCalledWith(42, 'Failed to initiate Trakt authentication.')
  })

  test('should send auth instructions when getDeviceCode succeeds', async () => {
    getDeviceCodeMock.mockResolvedValue({
      device_code: 'dev',
      expires_in: 0,
      interval: 1,
      user_code: 'ABC',
      verification_url: 'https://trakt.tv/activate',
    })

    const state = await traktAuthCommand(client, makeMessage(42))

    expect(state).toEqual({ step: 'idle' })
    const [chatId, message] = sendMessageMock.mock.calls[0] ?? []
    expect(chatId).toBe(42)
    expect(message).toContain('https://trakt.tv/activate')
    expect(message).toContain('*ABC*')
  })
})

describe('syncTraktCommand', () => {
  const client = new MockTelegramClient()

  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete(traktTokens)
    await db.delete(traktSyncHistory)
  })

  test('should send summary when sync succeeds', async () => {
    await db.insert(traktTokens).values({
      accessToken: 'access',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      refreshToken: 'refresh',
    })

    const state = await syncTraktCommand(client, makeMessage(42))

    expect(state).toEqual({ step: 'idle' })
    expect(syncWatchedHistoryMock).toHaveBeenCalled()
    const lastCall = sendMessageMock.mock.calls.at(-1) ?? []
    expect(lastCall[0]).toBe(42)
    expect(lastCall[1]).toContain('Trakt Sync Summary')
    expect(lastCall[1]).toContain('Movies added: 1')
    expect(lastCall[1]).toContain('Episodes added: 1')
  })

  test('should report failure when sync returns an error', async () => {
    const state = await syncTraktCommand(client, makeMessage(42))

    expect(state).toEqual({ step: 'idle' })
    const lastCall = sendMessageMock.mock.calls.at(-1) ?? []
    expect(lastCall[0]).toBe(42)
    expect(lastCall[1]).toMatch(/Trakt sync failed:/)
  })
})
