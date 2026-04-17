import {
  buildMediaTypeKeyboard,
  navigateMediaPage,
  selectLanguage,
  selectMedia,
  selectMediaType,
} from '#features/language-sync/services/language.service'
import { type MediaType } from '#integrations/plex/plex.service'
import { type ITelegramClient } from '#integrations/telegram/telegram.service'
import { type TelegramCallbackQuery, type TelegramMessageIn } from '#integrations/telegram/telegram.validator'
import { type ConversationState } from '#providers/telegram/types'

const handleSetLanguageCommand = async (client: ITelegramClient, message: TelegramMessageIn): Promise<ConversationState> => {
  const messageId = await client.sendMessage(message.chat.id, 'What kind of media do you want to configure?', {
    replyMarkup: buildMediaTypeKeyboard(),
  })
  if (!messageId) {
    return { step: 'idle' }
  }
  return { messageId, step: 'awaiting_media_type' }
}

const handleSetLanguageCallback = async (
  client: ITelegramClient,
  chatId: number,
  params: { state: ConversationState; callback: TelegramCallbackQuery }
): Promise<ConversationState> => {
  const { state, callback } = params
  const data = callback.data ?? ''
  await client.answerCallbackQuery(callback.id)

  if (state.step === 'awaiting_media_type') {
    if (data !== 'movie' && data !== 'show') {
      return state
    }
    return selectMediaType(client, chatId, { mediaType: data as MediaType, state })
  }

  if (state.step === 'awaiting_media_selection') {
    if (data.startsWith('page:')) {
      return navigateMediaPage(client, chatId, { page: Number.parseInt(data.slice(5), 10), state })
    }
    if (data.startsWith('select_media:')) {
      return selectMedia(client, chatId, { state, tmdbId: Number.parseInt(data.slice(13), 10) })
    }
  }

  if (state.step === 'awaiting_language') {
    if (data.startsWith('lang:')) {
      return selectLanguage(client, chatId, { lang: data.slice(5), state })
    }
  }

  return state
}

export const setLanguageConversation = { onCallback: handleSetLanguageCallback, onCommand: handleSetLanguageCommand }
