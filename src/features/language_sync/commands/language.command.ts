import { Effect } from 'effect'

import {
  buildMediaTypeKeyboard,
  navigateMediaPage,
  selectLanguage,
  selectMedia,
  selectMediaType,
} from '@/features/language_sync/services/language.service'
import { type ITelegramClient } from '@/integrations/telegram/telegram.service'
import { type TelegramCallbackQuery, type TelegramMessageIn } from '@/integrations/telegram/telegram.validator'
import { type ConversationState } from '@/providers/telegram/types'

const handleSetLanguageCommand = (client: ITelegramClient, message: TelegramMessageIn) =>
  client.sendMessage(message.chat.id, 'What kind of media do you want to configure?', { replyMarkup: buildMediaTypeKeyboard() }).pipe(
    Effect.map((messageId) => ({ messageId, step: 'awaiting_media_type' }) as const),
    Effect.orElseSucceed(() => ({ step: 'idle' }) as const)
  )

const handleSetLanguageCallback = (client: ITelegramClient, chatId: number, params: { state: ConversationState; callback: TelegramCallbackQuery }) =>
  Effect.gen(function* () {
    const { state, callback } = params
    const data = callback.data ?? ''
    yield* client.answerCallbackQuery(callback.id)

    if (state.step === 'awaiting_media_type') {
      return data === 'movie' || data === 'show' ? yield* selectMediaType(client, chatId, { mediaType: data, state }) : state
    }
    if (state.step === 'awaiting_media_selection') {
      if (data.startsWith('page:')) {
        return yield* navigateMediaPage(client, chatId, { page: Number.parseInt(data.slice(5), 10), state })
      }
      if (data.startsWith('select_media:')) {
        return yield* selectMedia(client, chatId, { state, tmdbId: Number.parseInt(data.slice(13), 10) })
      }
    }
    if (state.step === 'awaiting_language' && data.startsWith('lang:')) {
      return yield* selectLanguage(client, chatId, { lang: data.slice(5), state })
    }
    return state
  })

export const setLanguageConversation = { onCallback: handleSetLanguageCallback, onCommand: handleSetLanguageCommand }
