import { beforeEach } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { getDeviceCodeMock, MockTelegramClient, MockTraktClient, sendMessageMock, syncWatchedHistoryMock } from '@tests/utils'
import { Effect } from 'effect'

import { traktSyncHistory, traktTokens } from '@/database/schema'
import { syncTraktCommand, traktAuthCommand } from '@/features/trakt_sync/commands/trakt.command'

const client = new MockTelegramClient()
const message = { chat: { id: 1 }, message_id: 1, text: '/trakt' }

const insertValidToken = () =>
  Effect.promise(() =>
    db.insert(traktTokens).values({ accessToken: 'valid', expiresAt: Math.floor(Date.now() / 1000) + 3600, refreshToken: 'refresh' })
  )

describe('Trakt commands', () => {
  beforeEach(async () => {
    await db.delete(traktSyncHistory)
    await db.delete(traktTokens)
    sendMessageMock.mockClear().mockResolvedValue(100)
    getDeviceCodeMock.mockClear()
    syncWatchedHistoryMock.mockClear()
  })

  it.live('reports an existing authentication', () =>
    Effect.gen(function* () {
      yield* insertValidToken()
      expect(yield* provideTest(traktAuthCommand(client, message))).toEqual({ step: 'idle' })
      expect(sendMessageMock).toHaveBeenCalledWith(1, 'Already authentified.', undefined)
    })
  )

  it.live('reports device-code failure', () =>
    Effect.gen(function* () {
      getDeviceCodeMock.mockRejectedValueOnce(new Error('failed'))
      yield* provideTest(traktAuthCommand(client, message), { trakt: new MockTraktClient() })
      expect(sendMessageMock).toHaveBeenCalledWith(1, 'Failed to initiate Trakt authentication.', undefined)
    })
  )

  it.live('sends authentication instructions', () =>
    Effect.gen(function* () {
      yield* provideTest(traktAuthCommand(client, message), { trakt: new MockTraktClient() })
      expect(sendMessageMock.mock.calls.some((call) => call[1].includes('example.com'))).toBeTrue()
    })
  )

  it.live('sends a sync summary', () =>
    Effect.gen(function* () {
      yield* insertValidToken()
      yield* provideTest(syncTraktCommand(client, message), { trakt: new MockTraktClient() })
      expect(sendMessageMock.mock.calls.some((call) => call[1].includes('Movies added: 1'))).toBeTrue()
    })
  )

  it.live('reports sync failures', () =>
    Effect.gen(function* () {
      yield* insertValidToken()
      syncWatchedHistoryMock.mockRejectedValueOnce(new Error('failed'))
      yield* provideTest(syncTraktCommand(client, message), { trakt: new MockTraktClient() })
      expect(sendMessageMock.mock.calls.some((call) => call[1].includes('Trakt sync failed'))).toBeTrue()
    })
  )
})
