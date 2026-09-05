import { Cause, Crypto, Effect, Result } from 'effect'

import { AuthenticationTasks, Database, Plex } from '@/core/runtime.service'
import { getPlexToken } from '@/features/plex_auth/repositories/plex_auth.repository'
import { PlexTokenStore } from '@/features/plex_auth/services/plex_token.service'
import { type ITelegramClient } from '@/integrations/telegram/telegram.service'
import { type TelegramMessageIn } from '@/integrations/telegram/telegram.validator'

const POLL_INTERVAL = 5000

export const plexAuthCommand = (client: ITelegramClient, message: TelegramMessageIn) =>
  Effect.gen(function* () {
    const chatId = message.chat.id
    const plex = yield* Plex
    const stored = yield* getPlexToken
    if (stored !== undefined && (yield* plex.verifyToken(stored.authToken, stored.clientIdentifier).pipe(Effect.orElseSucceed(() => false)))) {
      yield* client.sendMessage(chatId, 'Already authenticated.')
      return { step: 'idle' } as const
    }

    const tasks = yield* AuthenticationTasks
    const taskKey = `plex:${chatId}`
    if (yield* tasks.isRunning(taskKey)) {
      yield* client.sendMessage(chatId, 'Plex authentication is already in progress.')
      return { step: 'idle' } as const
    }

    const crypto = yield* Crypto.Crypto
    const clientIdentifier = yield* crypto.randomUUIDv4
    const pin = yield* Effect.result(plex.createPin(clientIdentifier))
    if (Result.isFailure(pin)) {
      yield* Effect.logError(Cause.fail(pin.failure), 'Plex Auth')
      yield* client.sendMessage(chatId, 'Failed to initiate Plex authentication.')
      return { step: 'idle' } as const
    }

    const { code, expiresIn, id } = pin.success
    const url = `https://app.plex.tv/auth#?clientID=${clientIdentifier}&code=${code}&context%5Bdevice%5D%5Bproduct%5D=Autoscan`
    const messageId = yield* client.sendMessage(chatId, `[Authorize Autoscan on Plex](${url})`, { parseMode: 'Markdown' })

    const store = yield* PlexTokenStore
    const database = yield* Database
    const polling = Effect.gen(function* () {
      while (true) {
        yield* Effect.sleep(POLL_INTERVAL)
        const token = yield* plex.checkPin(id, clientIdentifier)
        if (token === undefined) {
          continue
        }
        yield* store.set(token, clientIdentifier)
        yield* client.editMessageText(chatId, messageId, { text: 'Plex authentication successful!' })
        return
      }
    }).pipe(
      Effect.timeoutOrElse({
        duration: expiresIn * 1000,
        orElse: () => client.editMessageText(chatId, messageId, { text: 'Plex authentication failed or timed out.' }),
      }),
      Effect.catchCauseIf(
        (cause) => !Cause.hasInterruptsOnly(cause),
        (cause) =>
          Effect.logError(cause, 'Plex Auth').pipe(
            Effect.flatMap(() => client.editMessageText(chatId, messageId, { text: 'Plex authentication failed or timed out.' }))
          )
      ),
      Effect.provideService(Database, database)
    )

    yield* tasks.start(taskKey, polling)
    return { step: 'idle' } as const
  })
