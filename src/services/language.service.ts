import { and, eq } from 'drizzle-orm'

import { db } from '@/config/db'
import { logger } from '@/config/logger'
import { container, TOKENS } from '@/core/container'
import { media, type Media } from '@/database/schema'
import type { IPlexClient, MediaType } from '@/integrations/plex.service'
import type { ITelegramClient } from '@/integrations/telegram.service'
import { getMediaByTypeWithPagination } from '@/repositories/media.repository'
import { iso1ToIso2T } from '@/types/iso_codes'
import type { UpdateLanguageParams } from '@/types/language'
import type { ConversationState, InlineKeyboardButton, InlineKeyboardMarkup } from '@/types/telegram'
import { normalizeToIso1 } from '@/utils/iso_codes'

const PAGE_SIZE = 10

type AwaitingMediaTypeState = Extract<ConversationState, { step: 'awaiting_media_type' }>
type AwaitingMediaSelectionState = Extract<ConversationState, { step: 'awaiting_media_selection' }>
type AwaitingLanguageState = Extract<ConversationState, { step: 'awaiting_language' }>

export const buildMediaTypeKeyboard = (): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: '🎞️ Movie', callback_data: 'movie' },
      { text: '📺 TV Show', callback_data: 'show' },
    ],
  ],
})

export const buildMediaKeyboard = (mediaList: Media[], page: number): InlineKeyboardMarkup => {
  const items = mediaList.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const rows = items.map((m) => [{ text: m.title, callback_data: `select_media:${m.tmdbId}` }])
  const nav: InlineKeyboardButton[] = []
  if (page > 0) {
    nav.push({ text: '◀️ Previous', callback_data: `page:${page - 1}` })
  }
  if ((page + 1) * PAGE_SIZE < mediaList.length) {
    nav.push({ text: 'Next ▶️', callback_data: `page:${page + 1}` })
  }
  if (nav.length > 0) {
    rows.push(nav)
  }
  return { inline_keyboard: rows }
}

export const buildLanguageKeyboard = (): InlineKeyboardMarkup => {
  const codes = Object.keys(iso1ToIso2T)
  const rows: InlineKeyboardButton[][] = []
  for (let i = 0; i < codes.length; i += 6) {
    rows.push(codes.slice(i, i + 6).map((c) => ({ text: c, callback_data: `lang:${c}` })))
  }
  return { inline_keyboard: rows }
}

export const handleUpdateLanguage = async (params: UpdateLanguageParams) => {
  const { mediaTitle, partsId, preferredLanguage, streams } = params

  const audioStream = streams.find((stream) => stream.streamType === 2 && normalizeToIso1(stream.languageCode) === preferredLanguage)

  if (!audioStream) {
    logger.warn(`No ${preferredLanguage} audio stream found`, 'Language', mediaTitle)
    return
  }

  if (!audioStream.selected) {
    logger.info(`Setting audio in ${preferredLanguage}`, 'Language', mediaTitle)

    const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)

    await plexClient.updateStream(partsId, audioStream.id, 'audio')

    if (preferredLanguage === 'fr') {
      await plexClient.updateStream(partsId, 0, 'subtitle')
    }
  }
}

export const selectMediaType = async (
  client: ITelegramClient,
  chatId: number,
  state: AwaitingMediaTypeState,
  mediaType: MediaType
): Promise<ConversationState> => {
  const mediaItems = await getMediaByTypeWithPagination(mediaType, 0, 100)

  if (mediaItems.length === 0) {
    await client.editMessageText(chatId, state.messageId, `No media in ${mediaType} library`)
    return { step: 'idle' }
  }

  await client.editMessageText(chatId, state.messageId, `Which ${mediaType} do you want to configure?`, buildMediaKeyboard(mediaItems, 0))
  return { step: 'awaiting_media_selection', messageId: state.messageId, mediaType, page: 0 }
}

export const navigateMediaPage = async (
  client: ITelegramClient,
  chatId: number,
  state: AwaitingMediaSelectionState,
  page: number
): Promise<ConversationState> => {
  const mediaItems = await getMediaByTypeWithPagination(state.mediaType, 0, 100)
  await client.editMessageText(chatId, state.messageId, `Which ${state.mediaType} do you want to configure?`, buildMediaKeyboard(mediaItems, page))
  return { ...state, page }
}

export const selectMedia = async (
  client: ITelegramClient,
  chatId: number,
  state: AwaitingMediaSelectionState,
  tmdbId: number
): Promise<ConversationState> => {
  const mediaItems = await getMediaByTypeWithPagination(state.mediaType, 0, 100)
  const selectedMedia = mediaItems.find((m) => m.tmdbId === tmdbId)
  if (!selectedMedia) {
    return state
  }
  await client.editMessageText(chatId, state.messageId, `Which language do you want to set for ${selectedMedia.title}?`, buildLanguageKeyboard())
  return { step: 'awaiting_language', messageId: state.messageId, tmdbId, mediaType: state.mediaType }
}

export const selectLanguage = async (
  client: ITelegramClient,
  chatId: number,
  state: AwaitingLanguageState,
  lang: string
): Promise<ConversationState> => {
  await db
    .update(media)
    .set({ preferredLanguage: normalizeToIso1(lang) })
    .where(and(eq(media.tmdbId, state.tmdbId), eq(media.type, state.mediaType)))
  await client.editMessageText(chatId, state.messageId, `Language updated to ${lang}`)
  return { step: 'idle' }
}
