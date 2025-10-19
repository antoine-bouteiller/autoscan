import { ConversationMenuRange } from '@grammyjs/conversations'
import { and, eq } from 'drizzle-orm'
import { InlineKeyboard } from 'grammy'

import type { MediaType } from '@/types/plex'
import type { ConfigureLanguageContext, ConfigureLanguageConversation } from '@/types/telegram'

import { getMediaByTypeWithPagination } from '@/app/services/media_service'
import { db } from '@/config/db'
import env from '@/config/env'
import { type Media, media as mediaTable } from '@/db/schema'
import { countryISOMapping } from '@/types/iso_codes'

export async function selectMediaType(
  conversation: ConfigureLanguageConversation,
  ctx: ConfigureLanguageContext
) {
  if (ctx.message?.chat.id !== env.TELEGRAM_CHAT_ID) {
    return ctx.reply('Unauthorized')
  }
  const message = await ctx.reply('What kind of media do you want to configure ?', {
    reply_markup: new InlineKeyboard().text('🎞️ Movie', 'movie').text('📺 TV Show', 'show'),
  })
  const { callbackQuery: mediaTypeQuery } = await conversation.waitFor('callback_query:data')
  const mediaType = mediaTypeQuery.data as MediaType

  const media = await conversation.external(() => getMediaByTypeWithPagination(mediaType, 0, 100))

  function createMenu(
    conversation: ConfigureLanguageConversation,
    media: Media[],
    page: number,
    parent?: string
  ) {
    const currentMenu = media.slice(0, 10)

    const nextMenu = media.slice(10)

    const menuId = `menu-${page}`

    const menu = conversation.menu(menuId, { parent })

    menu.dynamic(async () => {
      return currentMenu.reduce(
        (range, entry) =>
          range
            .text(entry.title, async () => {
              await message.editText(`Wich language do you want to set for ${entry.title} ?`)

              const language = await conversation.form.select(Object.values(countryISOMapping), {
                action: (ctx) => ctx.deleteMessage(),
                otherwise: (ctx) => ctx.reply('Invalid language code'),
              })

              await conversation.external(() =>
                db
                  .update(mediaTable)
                  .set({
                    originalLanguage: language,
                  })
                  .where(and(eq(mediaTable.tmdbId, entry.tmdbId), eq(mediaTable.type, mediaType)))
              )

              await message.editText(`Language of ${entry.title} updated to ${language}`)

              await conversation.halt()
            })
            .row(),
        new ConversationMenuRange<ConfigureLanguageContext>()
      )
    })

    if (0 < page) {
      menu.back('Previous')
    }

    if (0 < nextMenu.length) {
      menu.submenu('Next', createMenu(conversation, nextMenu, page + 1, menuId))
    }

    return menu
  }

  await message.editText(`Wich ${mediaType} do you want to configure ?`, {
    reply_markup: createMenu(conversation, media, 0),
  })

  await conversation.waitUntil(() => false)
}
