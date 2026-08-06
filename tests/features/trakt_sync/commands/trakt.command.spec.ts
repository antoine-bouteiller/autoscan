import { beforeEach, describe, expect, test } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { runTest } from '@tests/effect'
import { getDeviceCodeMock, MockTelegramClient, MockTraktClient, sendMessageMock, syncWatchedHistoryMock } from '@tests/utils'

import { traktSyncHistory, traktTokens } from '@/database/schema'
import { syncTraktCommand, traktAuthCommand } from '@/features/trakt_sync/commands/trakt.command'

const client = new MockTelegramClient()
const message = { chat: { id: 1 }, message_id: 1, text: '/trakt' }

describe('Trakt commands', () => {
  beforeEach(async () => {
    await db.delete(traktSyncHistory)
    await db.delete(traktTokens)
    sendMessageMock.mockClear().mockResolvedValue(100)
    getDeviceCodeMock.mockClear()
    syncWatchedHistoryMock.mockClear()
  })

  test('reports an existing authentication', async () => {
    await db.insert(traktTokens).values({ accessToken: 'valid', expiresAt: Math.floor(Date.now() / 1000) + 3600, refreshToken: 'refresh' })
    expect(await runTest(traktAuthCommand(client, message))).toEqual({ step: 'idle' })
    expect(sendMessageMock).toHaveBeenCalledWith(1, 'Already authentified.', undefined)
  })

  test('reports device-code failure', async () => {
    getDeviceCodeMock.mockRejectedValueOnce(new Error('failed'))
    await runTest(traktAuthCommand(client, message), { trakt: new MockTraktClient() })
    expect(sendMessageMock).toHaveBeenCalledWith(1, 'Failed to initiate Trakt authentication.', undefined)
  })

  test('sends authentication instructions', async () => {
    await runTest(traktAuthCommand(client, message), { trakt: new MockTraktClient() })
    expect(sendMessageMock.mock.calls.some((call) => call[1].includes('example.com'))).toBeTrue()
  })

  test('sends a sync summary', async () => {
    await db.insert(traktTokens).values({ accessToken: 'valid', expiresAt: Math.floor(Date.now() / 1000) + 3600, refreshToken: 'refresh' })
    await runTest(syncTraktCommand(client, message), { trakt: new MockTraktClient() })
    expect(sendMessageMock.mock.calls.some((call) => call[1].includes('Movies added: 1'))).toBeTrue()
  })

  test('reports sync failures', async () => {
    await db.insert(traktTokens).values({ accessToken: 'valid', expiresAt: Math.floor(Date.now() / 1000) + 3600, refreshToken: 'refresh' })
    syncWatchedHistoryMock.mockRejectedValueOnce(new Error('failed'))
    await runTest(syncTraktCommand(client, message), { trakt: new MockTraktClient() })
    expect(sendMessageMock.mock.calls.some((call) => call[1].includes('Trakt sync failed'))).toBeTrue()
  })
})
