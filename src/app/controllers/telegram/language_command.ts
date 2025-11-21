import { InlineKeyboard } from 'grammy'

import type { MediaType } from '@/types/plex'
import type { ConfigureLanguageContext, ConfigureLanguageConversation } from '@/types/telegram'

import { getMediaByTypeWithPagination } from '@/app/services/media/media_service'
import { createMenu } from '@/app/services/telegram/select_preferred_language_service'
import env from '@/config/env'

export const selectPreferedLanguage = async (
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

  await message.editText(`Wich ${mediaType} do you want to configure ?`, {
    reply_markup: createMenu({
      mediaType,
      menuConversation: conversation,
      menuMedia: media,
      message,
      page: 0,
    }),
  })

  await conversation.waitUntil(() => false)
}
