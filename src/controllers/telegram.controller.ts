import { and, eq } from 'drizzle-orm'

import { db } from '@/config/db'
import { media } from '@/database/schema'
import type { MediaType } from '@/integrations/plex.service'
import type { TelegramClient } from '@/integrations/telegram.service'
import { getMediaByTypeWithPagination } from '@/repositories/media.repository'
import { buildLanguageKeyboard, buildMediaKeyboard, buildMediaTypeKeyboard } from '@/services/telegram.service'
import type { ConversationState } from '@/types/telegram'
import { normalizeToIso1 } from '@/utils/iso_codes'
import type { TelegramCallbackQuery, TelegramMessageIn } from '@/validators/telegram.validator'

const handleSetLanguageCommand = async (client: TelegramClient, message: TelegramMessageIn): Promise<ConversationState> => {
  const messageId = await client.sendMessage(message.chat.id, 'What kind of media do you want to configure?', buildMediaTypeKeyboard())
  if (!messageId) {
    return { step: 'idle' }
  }
  return { step: 'awaiting_media_type', messageId }
}

const handleCallback = async (
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
    const mediaType = data as MediaType
    const mediaItems = await getMediaByTypeWithPagination(mediaType, 0, 100)

    if (mediaItems.length === 0) {
      await client.editMessageText(chatId, state.messageId, `No media in ${mediaType} library`)
      return { step: 'idle' }
    }

    await client.editMessageText(chatId, state.messageId, `Which ${mediaType} do you want to configure?`, buildMediaKeyboard(mediaItems, 0))
    return { step: 'awaiting_media_selection', messageId: state.messageId, mediaType, page: 0 }
  }

  if (state.step === 'awaiting_media_selection') {
    if (data.startsWith('page:')) {
      const page = Number.parseInt(data.slice(5), 10)
      const mediaItems = await getMediaByTypeWithPagination(state.mediaType, 0, 100)
      await client.editMessageText(
        chatId,
        state.messageId,
        `Which ${state.mediaType} do you want to configure?`,
        buildMediaKeyboard(mediaItems, page)
      )
      return { ...state, page }
    }
    if (data.startsWith('select_media:')) {
      const tmdbId = Number.parseInt(data.slice(13), 10)
      const mediaItems = await getMediaByTypeWithPagination(state.mediaType, 0, 100)
      const selectedMedia = mediaItems.find((m) => m.tmdbId === tmdbId)
      if (!selectedMedia) {
        return state
      }
      await client.editMessageText(chatId, state.messageId, `Which language do you want to set for ${selectedMedia.title}?`, buildLanguageKeyboard())
      return { step: 'awaiting_language', messageId: state.messageId, tmdbId, mediaType: state.mediaType }
    }
  }

  if (state.step === 'awaiting_language') {
    if (data.startsWith('lang:')) {
      const lang = data.slice(5)
      await db
        .update(media)
        .set({ preferredLanguage: normalizeToIso1(lang) })
        .where(and(eq(media.tmdbId, state.tmdbId), eq(media.type, state.mediaType)))
      await client.editMessageText(chatId, state.messageId, `Language updated to ${lang}`)
      return { step: 'idle' }
    }
  }

  return state
}

export const setLanguageConversation = { onCommand: handleSetLanguageCommand, onCallback: handleCallback }
