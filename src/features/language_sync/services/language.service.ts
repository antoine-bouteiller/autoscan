import { and, eq } from 'drizzle-orm'

import { db } from '#config/db'
import { logger } from '#config/logger'
import { container, TOKENS } from '#core/container'
import { media, type Media } from '#database/schema'
import { getMediaByTypeWithPagination } from '#domains/media/repositories/media.repository'
import { type UpdateLanguageParams } from '#features/language_sync/types'
import { type MediaType } from '#integrations/plex/plex.service'
import { type ITelegramClient } from '#integrations/telegram/telegram.service'
import { type ConversationState, type InlineKeyboardButton, type InlineKeyboardMarkup } from '#providers/telegram/types'
import { iso1ToIso2T } from '#shared/types/iso_codes'
import { normalizeToIso1 } from '#shared/utils/iso_codes'

const PAGE_SIZE = 10

type AwaitingMediaTypeState = Extract<ConversationState, { step: 'awaiting_media_type' }>
type AwaitingMediaSelectionState = Extract<ConversationState, { step: 'awaiting_media_selection' }>
type AwaitingLanguageState = Extract<ConversationState, { step: 'awaiting_language' }>

export const buildMediaTypeKeyboard = (): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { callback_data: 'movie', text: '🎞️ Movie' },
      { callback_data: 'show', text: '📺 TV Show' },
    ],
  ],
})

export const buildMediaKeyboard = (mediaList: Media[], page: number): InlineKeyboardMarkup => {
  const items = mediaList.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const rows = items.map((item) => [{ callback_data: `select_media:${item.tmdbId}`, text: item.title }])
  const nav: InlineKeyboardButton[] = []
  if (page > 0) {
    nav.push({ callback_data: `page:${page - 1}`, text: '◀️ Previous' })
  }
  if ((page + 1) * PAGE_SIZE < mediaList.length) {
    nav.push({ callback_data: `page:${page + 1}`, text: 'Next ▶️' })
  }
  if (nav.length > 0) {
    rows.push(nav)
  }
  return { inline_keyboard: rows }
}

export const buildLanguageKeyboard = (): InlineKeyboardMarkup => {
  const codes = Object.keys(iso1ToIso2T)
  const rows: InlineKeyboardButton[][] = []
  for (let idx = 0; idx < codes.length; idx += 6) {
    rows.push(codes.slice(idx, idx + 6).map((code) => ({ callback_data: `lang:${code}`, text: code })))
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

    const plexClient = container.resolve(TOKENS.PLEX_CLIENT)

    await plexClient.updateStream(partsId, audioStream.id, 'audio')

    if (preferredLanguage === 'fr') {
      await plexClient.updateStream(partsId, 0, 'subtitle')
    }
  }
}

export const selectMediaType = async (
  client: ITelegramClient,
  chatId: number,
  params: { state: AwaitingMediaTypeState; mediaType: MediaType }
): Promise<ConversationState> => {
  const { state, mediaType } = params
  const mediaItems = await getMediaByTypeWithPagination(mediaType, 0, 100)

  if (mediaItems.length === 0) {
    await client.editMessageText(chatId, state.messageId, { text: `No media in ${mediaType} library` })
    return { step: 'idle' }
  }

  await client.editMessageText(chatId, state.messageId, {
    replyMarkup: buildMediaKeyboard(mediaItems, 0),
    text: `Which ${mediaType} do you want to configure?`,
  })
  return { mediaType, messageId: state.messageId, page: 0, step: 'awaiting_media_selection' }
}

export const navigateMediaPage = async (
  client: ITelegramClient,
  chatId: number,
  params: { state: AwaitingMediaSelectionState; page: number }
): Promise<ConversationState> => {
  const { state, page } = params
  const mediaItems = await getMediaByTypeWithPagination(state.mediaType, 0, 100)
  await client.editMessageText(chatId, state.messageId, {
    replyMarkup: buildMediaKeyboard(mediaItems, page),
    text: `Which ${state.mediaType} do you want to configure?`,
  })
  return { ...state, page }
}

export const selectMedia = async (
  client: ITelegramClient,
  chatId: number,
  params: { state: AwaitingMediaSelectionState; tmdbId: number }
): Promise<ConversationState> => {
  const { state, tmdbId } = params
  const mediaItems = await getMediaByTypeWithPagination(state.mediaType, 0, 100)
  const selectedMedia = mediaItems.find((item) => item.tmdbId === tmdbId)
  if (!selectedMedia) {
    return state
  }
  await client.editMessageText(chatId, state.messageId, {
    replyMarkup: buildLanguageKeyboard(),
    text: `Which language do you want to set for ${selectedMedia.title}?`,
  })
  return { mediaType: state.mediaType, messageId: state.messageId, step: 'awaiting_language', tmdbId }
}

export const selectLanguage = async (
  client: ITelegramClient,
  chatId: number,
  params: { state: AwaitingLanguageState; lang: string }
): Promise<ConversationState> => {
  const { state, lang } = params
  await db
    .update(media)
    .set({ preferredLanguage: normalizeToIso1(lang) })
    .where(and(eq(media.tmdbId, state.tmdbId), eq(media.type, state.mediaType)))
  await client.editMessageText(chatId, state.messageId, { text: `Language updated to ${lang}` })
  return { step: 'idle' }
}
