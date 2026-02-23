import type { MediaType } from '@/integrations/plex.service'
import type { TelegramClient } from '@/integrations/telegram.service'
import { buildMediaTypeKeyboard, navigateMediaPage, selectLanguage, selectMedia, selectMediaType } from '@/services/language.service'
import type { ConversationState } from '@/types/telegram'
import type { TelegramCallbackQuery, TelegramMessageIn } from '@/validators/telegram.validator'

const handleSetLanguageCommand = async (client: TelegramClient, message: TelegramMessageIn): Promise<ConversationState> => {
  const messageId = await client.sendMessage(message.chat.id, 'What kind of media do you want to configure?', buildMediaTypeKeyboard())
  if (!messageId) {
    return { step: 'idle' }
  }
  return { step: 'awaiting_media_type', messageId }
}

const handleSetLanguageCallback = async (
  client: TelegramClient,
  chatId: number,
  state: ConversationState,
  callback: TelegramCallbackQuery
): Promise<ConversationState> => {
  const data = callback.data ?? ''
  await client.answerCallbackQuery(callback.id)

  if (state.step === 'awaiting_media_type') {
    if (data !== 'movie' && data !== 'show') {
      return state
    }
    return selectMediaType(client, chatId, state, data as MediaType)
  }

  if (state.step === 'awaiting_media_selection') {
    if (data.startsWith('page:')) {
      return navigateMediaPage(client, chatId, state, Number.parseInt(data.slice(5), 10))
    }
    if (data.startsWith('select_media:')) {
      return selectMedia(client, chatId, state, Number.parseInt(data.slice(13), 10))
    }
  }

  if (state.step === 'awaiting_language') {
    if (data.startsWith('lang:')) {
      return selectLanguage(client, chatId, state, data.slice(5))
    }
  }

  return state
}

export const setLanguageConversation = { onCommand: handleSetLanguageCommand, onCallback: handleSetLanguageCallback }
