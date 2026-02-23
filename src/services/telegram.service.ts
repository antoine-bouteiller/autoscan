import type { Media } from '@/database/schema'
import { iso1ToIso2T } from '@/types/iso_codes'
import type { InlineKeyboardButton, InlineKeyboardMarkup } from '@/types/telegram'

const PAGE_SIZE = 10

export const buildMediaTypeKeyboard = (): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: '🎞️ Movie', callback_data: 'movie' },
      { text: '📺 TV Show', callback_data: 'show' },
    ],
  ],
})

export const buildMediaKeyboard = (media: Media[], page: number): InlineKeyboardMarkup => {
  const items = media.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const rows = items.map((m) => [{ text: m.title, callback_data: `select_media:${m.tmdbId}` }])
  const nav: InlineKeyboardButton[] = []
  if (page > 0) {
    nav.push({ text: '◀️ Previous', callback_data: `page:${page - 1}` })
  }
  if ((page + 1) * PAGE_SIZE < media.length) {
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
