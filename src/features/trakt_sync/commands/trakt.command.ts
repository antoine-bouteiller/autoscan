import { Cause, Effect, Result } from 'effect'

import { Database, Trakt } from '@/core/runtime.service'
import { upsertTokens } from '@/features/trakt_sync/repositories/trakt.repository'
import { TraktAuthenticationTasks } from '@/features/trakt_sync/services/authentication.service'
import { getValidAccessToken, syncPlexToTrakt } from '@/features/trakt_sync/services/plextraktsync.service'
import { type ITelegramClient } from '@/integrations/telegram/telegram.service'
import { type TelegramMessageIn } from '@/integrations/telegram/telegram.validator'
import { HttpError } from '@/shared/errors/http'

export const traktAuthCommand = (client: ITelegramClient, message: TelegramMessageIn) =>
  Effect.gen(function* () {
    const chatId = message.chat.id
    const validToken = yield* Effect.result(getValidAccessToken)
    if (Result.isSuccess(validToken)) {
      yield* client.sendMessage(chatId, 'Already authentified.')
      return { step: 'idle' } as const
    }

    const tasks = yield* TraktAuthenticationTasks
    if (yield* tasks.isRunning(chatId)) {
      yield* client.sendMessage(chatId, 'Trakt authentication is already in progress.')
      return { step: 'idle' } as const
    }

    const traktClient = yield* Trakt
    const deviceCode = yield* Effect.result(traktClient.getDeviceCode)
    if (Result.isFailure(deviceCode)) {
      yield* Effect.logError(Cause.fail(deviceCode.failure), 'Trakt Auth')
      yield* client.sendMessage(chatId, 'Failed to initiate Trakt authentication.')
      return { step: 'idle' } as const
    }

    const result = deviceCode.success
    const authMessage = [
      'To authorize this application, please visit:',
      result.verification_url,
      '',
      `And enter the following code: *${result.user_code}*`,
    ].join('\n')
    yield* client.sendMessage(chatId, authMessage, { parseMode: 'Markdown' })

    const database = yield* Database
    const polling = Effect.gen(function* () {
      while (true) {
        yield* Effect.sleep(result.interval * 1000)
        const token = yield* traktClient.pollDeviceToken(result.device_code).pipe(
          Effect.catchIf(
            (error) => error instanceof HttpError && error.status === 400,
            () => Effect.void
          )
        )
        if (token === undefined) {
          continue
        }
        const expiresAt = Math.floor((yield* Effect.clockWith((clock) => clock.currentTimeMillis)) / 1000) + token.expires_in
        yield* upsertTokens(token.access_token, token.refresh_token, expiresAt)
        yield* client.sendMessage(chatId, 'Trakt authentication successful!')
        return
      }
    }).pipe(
      Effect.timeoutOrElse({
        duration: result.expires_in * 1000,
        orElse: () => client.sendMessage(chatId, 'Trakt authentication failed or timed out.').pipe(Effect.asVoid),
      }),
      Effect.catchCauseIf(
        (cause) => !Cause.hasInterruptsOnly(cause),
        (cause) =>
          Effect.logError(cause, 'Trakt Auth').pipe(
            Effect.flatMap(() => client.sendMessage(chatId, 'Trakt authentication failed or timed out.')),
            Effect.asVoid
          )
      ),
      Effect.provideService(Database, database)
    )

    yield* tasks.start(chatId, polling)
    return { step: 'idle' } as const
  })

export const syncTraktCommand = (client: ITelegramClient, message: TelegramMessageIn) =>
  Effect.gen(function* () {
    yield* client.sendMessage(message.chat.id, 'Starting Trakt sync...')
    const result = yield* Effect.result(syncPlexToTrakt)
    if (Result.isFailure(result)) {
      yield* Effect.logError(Cause.fail(result.failure), 'Trakt Sync Command')
      yield* client.sendMessage(message.chat.id, `Trakt sync failed: ${result.failure.message}`)
      return { step: 'idle' } as const
    }
    const summary = ['*Trakt Sync Summary*', `Movies added: ${result.success.movies}`, `Episodes added: ${result.success.episodes}`].join('\n')
    yield* client.sendMessage(message.chat.id, summary, { parseMode: 'Markdown' })
    return { step: 'idle' } as const
  })
