import { beforeEach } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { checkPinMock, createPinMock, editMessageTextMock, MockTelegramClient, sendMessageMock, verifyTokenMock } from '@tests/utils'
import { DateTime, Effect } from 'effect'
import { TestClock } from 'effect/testing'

import { AuthenticationTasks } from '@/core/runtime.service'
import { plexTokens } from '@/database/schema'
import { plexAuthCommand } from '@/features/plex_auth/commands/plex.command'

const client = new MockTelegramClient()
const message = { chat: { id: 1 }, message_id: 1, text: '/plex' }

const storeToken = Effect.gen(function* () {
  const linkedAt = yield* DateTime.nowAsDate
  yield* Effect.promise(() => db.insert(plexTokens).values({ authToken: 'stored', clientIdentifier: 'stored-id', linkedAt }))
})

describe('Plex auth command', () => {
  beforeEach(() =>
    Effect.runPromise(
      Effect.gen(function* () {
        yield* Effect.promise(() => db.delete(plexTokens))
        sendMessageMock.mockClear().mockResolvedValue(100)
        editMessageTextMock.mockClear()
        createPinMock.mockClear().mockResolvedValue({ code: 'PIN1', expiresIn: 900, id: 42 })
        checkPinMock.mockClear().mockResolvedValue(undefined)
        verifyTokenMock.mockClear().mockResolvedValue(true)
      })
    )
  )

  it.live('reports an accepted stored token', () =>
    Effect.gen(function* () {
      yield* storeToken
      expect(yield* provideTest(plexAuthCommand(client, message))).toEqual({ step: 'idle' })
      expect(verifyTokenMock).toHaveBeenCalledWith('stored', 'stored-id')
      expect(sendMessageMock).toHaveBeenCalledWith(1, 'Already authenticated.', undefined)
      expect(createPinMock).not.toHaveBeenCalled()
    })
  )

  it.live('links again when the stored token is rejected', () =>
    Effect.gen(function* () {
      yield* storeToken
      verifyTokenMock.mockResolvedValue(false)
      yield* provideTest(plexAuthCommand(client, message))
      expect(
        sendMessageMock.mock.calls.some((call) => call[1].includes('[Authorize Autoscan on Plex](https://app.plex.tv/auth#?clientID='))
      ).toBeTrue()
    })
  )

  it.live('reports a pin creation failure', () =>
    Effect.gen(function* () {
      createPinMock.mockRejectedValueOnce(new Error('failed'))
      yield* provideTest(plexAuthCommand(client, message))
      expect(sendMessageMock).toHaveBeenCalledWith(1, 'Failed to initiate Plex authentication.', undefined)
    })
  )

  it.effect('stores the token once the pin is claimed', () =>
    Effect.gen(function* () {
      checkPinMock.mockResolvedValue('granted')
      yield* provideTest(
        Effect.gen(function* () {
          const tasks = yield* AuthenticationTasks
          yield* plexAuthCommand(client, message)
          yield* Effect.yieldNow
          yield* TestClock.adjust(5000)
          yield* tasks.awaitEmpty
        })
      )

      const rows = yield* Effect.promise(() => db.select().from(plexTokens))
      expect(rows[0]?.authToken).toBe('granted')
      expect(editMessageTextMock).toHaveBeenLastCalledWith(1, 100, { text: 'Plex authentication successful!' })
    })
  )

  it.effect('gives up when the pin expires', () =>
    Effect.gen(function* () {
      createPinMock.mockResolvedValue({ code: 'PIN1', expiresIn: 10, id: 42 })
      yield* provideTest(
        Effect.gen(function* () {
          const tasks = yield* AuthenticationTasks
          yield* plexAuthCommand(client, message)
          yield* Effect.yieldNow
          yield* TestClock.adjust(10_000)
          yield* tasks.awaitEmpty
        })
      )

      expect(yield* Effect.promise(() => db.select().from(plexTokens))).toHaveLength(0)
      expect(editMessageTextMock).toHaveBeenLastCalledWith(1, 100, { text: 'Plex authentication failed or timed out.' })
    })
  )
})
