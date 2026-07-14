import { type MediaType } from '@/integrations/plex/plex.service'

export type ConversationState =
  | { step: 'idle' }
  | { step: 'awaiting_media_type'; messageId: number }
  | { step: 'awaiting_media_selection'; messageId: number; mediaType: MediaType; page: number }
  | { step: 'awaiting_language'; messageId: number; tmdbId: number; mediaType: MediaType }

export interface InlineKeyboardButton {
  text: string
  callback_data: string
}
export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][]
}
