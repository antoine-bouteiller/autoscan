import { and, eq } from 'drizzle-orm'
import { Effect } from 'effect'

import { DatabaseQueryError } from '@/config/db'
import { Database, Plex } from '@/core/runtime.service'
import { media, type Media } from '@/database/schema'
import { getMediaByTypeWithPagination } from '@/domains/media/repositories/media.repository'
import { type UpdateLanguageParams } from '@/features/language_sync/types'
import { type MediaType } from '@/integrations/plex/plex.service'
import { type ITelegramClient } from '@/integrations/telegram/telegram.service'
import { type ConversationState, type InlineKeyboardButton, type InlineKeyboardMarkup } from '@/providers/telegram/types'
import { iso1ToIso2T } from '@/shared/types/iso_codes'
import { normalizeToIso1 } from '@/shared/utils/iso_codes'

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
  for (let index = 0; index < codes.length; index += 6) {
    rows.push(codes.slice(index, index + 6).map((code) => ({ callback_data: `lang:${code}`, text: code })))
  }
  return { inline_keyboard: rows }
}

export const handleUpdateLanguage = (params: UpdateLanguageParams) =>
  Effect.gen(function* () {
    const { mediaTitle, partsId, preferredLanguage, streams } = params
    const audioStream = streams.find((stream) => stream.streamType === 2 && normalizeToIso1(stream.languageCode) === preferredLanguage)

    if (audioStream === undefined) {
      yield* Effect.logWarning(`No ${preferredLanguage} audio stream found`).pipe(Effect.annotateLogs('context', ['Language', mediaTitle]))
      return
    }

    if (!audioStream.selected) {
      const plexClient = yield* Plex
      yield* Effect.logInfo(`Setting audio in ${preferredLanguage}`).pipe(Effect.annotateLogs('context', ['Language', mediaTitle]))
      yield* plexClient.updateStream(partsId, audioStream.id, 'audio')
      if (preferredLanguage === 'fr') {
        yield* plexClient.updateStream(partsId, 0, 'subtitle')
      }
    }
  })

export const selectMediaType = (client: ITelegramClient, chatId: number, params: { state: AwaitingMediaTypeState; mediaType: MediaType }) =>
  Effect.gen(function* () {
    const { state, mediaType } = params
    const mediaItems = yield* getMediaByTypeWithPagination(mediaType, 0, 100)
    if (mediaItems.length === 0) {
      yield* client.editMessageText(chatId, state.messageId, { text: `No media in ${mediaType} library` })
      return { step: 'idle' } as const
    }
    yield* client.editMessageText(chatId, state.messageId, {
      replyMarkup: buildMediaKeyboard(mediaItems, 0),
      text: `Which ${mediaType} do you want to configure?`,
    })
    return { mediaType, messageId: state.messageId, page: 0, step: 'awaiting_media_selection' } as const
  })

export const navigateMediaPage = (client: ITelegramClient, chatId: number, params: { state: AwaitingMediaSelectionState; page: number }) =>
  Effect.gen(function* () {
    const { state, page } = params
    const mediaItems = yield* getMediaByTypeWithPagination(state.mediaType, 0, 100)
    yield* client.editMessageText(chatId, state.messageId, {
      replyMarkup: buildMediaKeyboard(mediaItems, page),
      text: `Which ${state.mediaType} do you want to configure?`,
    })
    return { ...state, page }
  })

export const selectMedia = (client: ITelegramClient, chatId: number, params: { state: AwaitingMediaSelectionState; tmdbId: number }) =>
  Effect.gen(function* () {
    const { state, tmdbId } = params
    const mediaItems = yield* getMediaByTypeWithPagination(state.mediaType, 0, 100)
    const selectedMedia = mediaItems.find((item) => item.tmdbId === tmdbId)
    if (selectedMedia === undefined) {
      return state
    }
    yield* client.editMessageText(chatId, state.messageId, {
      replyMarkup: buildLanguageKeyboard(),
      text: `Which language do you want to set for ${selectedMedia.title}?`,
    })
    return { mediaType: state.mediaType, messageId: state.messageId, step: 'awaiting_language', tmdbId } as const
  })

export const selectLanguage = (client: ITelegramClient, chatId: number, params: { state: AwaitingLanguageState; lang: string }) =>
  Effect.gen(function* () {
    const { state, lang } = params
    yield* Database.use(({ db }) =>
      Effect.tryPromise({
        catch: (cause) => new DatabaseQueryError(cause),
        try: () =>
          db
            .update(media)
            .set({ preferredLanguage: normalizeToIso1(lang) })
            .where(and(eq(media.tmdbId, state.tmdbId), eq(media.type, state.mediaType))),
      })
    )
    yield* client.editMessageText(chatId, state.messageId, { text: `Language updated to ${lang}` })
    return { step: 'idle' } as const
  })
