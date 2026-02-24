import { container, TOKENS } from '@/core/container'
import { HttpError } from '@/errors/http'
import { type ITelegramClient } from '@/integrations/telegram.service'
import { type ITraktClient } from '@/integrations/trakt.service'
import { upsertTokens } from '@/repositories/trakt.repository'
import { getValidAccessToken, syncPlexToTrakt } from '@/services/plextraktsync.service'
import { type ConversationState } from '@/types/telegram'
import { isError, isOk, logError } from '@/utils/error'
import { type TelegramMessageIn } from '@/validators/telegram.validator'

export const traktAuthCommand = async (client: ITelegramClient, message: TelegramMessageIn): Promise<ConversationState> => {
  const traktClient = container.resolve<ITraktClient>(TOKENS.TRAKT_CLIENT)

  const token = await getValidAccessToken()

  if (isOk(token)) {
    await client.sendMessage(message.chat.id, 'Already authentified.')
    return { step: 'idle' }
  }

  const result = await traktClient.getDeviceCode()

  if (isError(result)) {
    logError(result, 'Trakt Auth')
    await client.sendMessage(message.chat.id, 'Failed to initiate Trakt authentication.')
    return { step: 'idle' }
  }

  const authMessage = [
    'To authorize this application, please visit:',
    result.verification_url,
    '',
    `And enter the following code: *${result.user_code}*`,
  ].join('\n')

  await client.sendMessage(message.chat.id, authMessage, undefined, 'Markdown')

  void (async () => {
    const start = Date.now()
    const expiresAt = start + result.expires_in * 1000
    const interval = result.interval * 1000

    while (Date.now() < expiresAt) {
      await new Promise((resolve) => setTimeout(resolve, interval))

      const tokenResult = await traktClient.pollDeviceToken(result.device_code)

      if (isError(tokenResult)) {
        if (tokenResult instanceof HttpError) {
          if (tokenResult.status === 400) {
            continue
          }
        }
        break
      }

      const tokenExpiresAt = Math.floor(Date.now() / 1000) + tokenResult.expires_in
      await upsertTokens(tokenResult.access_token, tokenResult.refresh_token, tokenExpiresAt)

      await client.sendMessage(message.chat.id, 'Trakt authentication successful!')
      return
    }

    await client.sendMessage(message.chat.id, 'Trakt authentication failed or timed out.')
  })()

  return { step: 'idle' }
}

export const syncTraktCommand = async (client: ITelegramClient, message: TelegramMessageIn): Promise<ConversationState> => {
  await client.sendMessage(message.chat.id, 'Starting Trakt sync...')

  const result = await syncPlexToTrakt()

  if (isError(result)) {
    logError(result, 'Trakt Sync Command')
    await client.sendMessage(message.chat.id, `Trakt sync failed: ${result.message}`)
    return { step: 'idle' }
  }

  const summary = ['*Trakt Sync Summary*', `Movies added: ${result.movies}`, `Episodes added: ${result.episodes}`].join('\n')

  await client.sendMessage(message.chat.id, summary, undefined, 'Markdown')

  return { step: 'idle' }
}
