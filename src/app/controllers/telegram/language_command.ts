import { ConversationMenuRange } from '@grammyjs/conversations'
import { and, eq } from 'drizzle-orm'
import { InlineKeyboard } from 'grammy'

import type { MediaType } from '@/types/plex'
import type { ConfigureLanguageContext, ConfigureLanguageConversation } from '@/types/telegram'

import { getMediaByTypeWithPagination } from '@/app/services/media/media_service'
import { db } from '@/config/db'
import env from '@/config/env'
import { type Media, media as mediaTable } from '@/database/schema'
import { iso1ToIso2T } from '@/types/iso_codes'

export const selectMediaType = async (
  conversation: ConfigureLanguageConversation,
  ctx: ConfigureLanguageContext
) => {
  if (ctx.message?.chat.id !== env.TELEGRAM_CHAT_ID) {
    return ctx.reply('Unauthorized')
  }
  const message = await ctx.reply('What kind of media do you want to configure ?', {
    reply_markup: new InlineKeyboard().text('🎞️ Movie', 'movie').text('📺 TV Show', 'show'),
  })
  const { callbackQuery: mediaTypeQuery } = await conversation.waitFor('callback_query:data')
  const mediaType = mediaTypeQuery.data as MediaType

  const media = await conversation.external(() => getMediaByTypeWithPagination(mediaType, 0, 100))

  const handleMediaSelection = async (
    menuConversation: ConfigureLanguageConversation,
    entry: Media
  ) => {
    await message.editText(`Wich language do you want to set for ${entry.title} ?`)

    // Use 2-character ISO codes for the selection
    const language = await menuConversation.form.select(Object.keys(iso1ToIso2T), {
      action: (ctx) => ctx.deleteMessage(),
      otherwise: (ctx) => ctx.reply('Invalid language code'),
    })

    await menuConversation.external(() =>
      db
        .update(mediaTable)
        .set({
          originalLanguage: language,
        })
        .where(and(eq(mediaTable.tmdbId, entry.tmdbId), eq(mediaTable.type, mediaType)))
    )

    await message.editText(`Language of ${entry.title} updated to ${language}`)

    await menuConversation.halt()
  }

  const createMenu = (
    menuConversation: ConfigureLanguageConversation,
    menuMedia: Media[],
    page: number
  ): ReturnType<typeof menuConversation.menu> => {
    const currentMenu = menuMedia.slice(0, 10)

    const nextMenu = menuMedia.slice(10)

    const menuId = `menu-${page}`
    const parentMenuId = page > 0 ? `menu-${page - 1}` : undefined

    const menu = menuConversation.menu(menuId, { parent: parentMenuId })

    menu.dynamic(() =>
      currentMenu.reduce(
        (range, entry) =>
          range.text(entry.title, () => handleMediaSelection(menuConversation, entry)).row(),
        new ConversationMenuRange<ConfigureLanguageContext>()
      )
    )

    if (page > 0) {
      menu.back('Previous')
    }

    if (nextMenu.length > 0) {
      menu.submenu('Next', createMenu(menuConversation, nextMenu, page + 1))
    }

    return menu
  }

  await message.editText(`Wich ${mediaType} do you want to configure ?`, {
    reply_markup: createMenu(conversation, media, 0),
  })

  await conversation.waitUntil(() => false)
}
