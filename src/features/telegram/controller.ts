import { InlineKeyboard } from 'grammy'

import type { MediaType } from '@/integrations/plex'

import env from '@/config/env'
import { getMediaByTypeWithPagination } from '@/features/media'

import type { ConfigureLanguageContext, ConfigureLanguageConversation } from './types'

import { createMenu } from './service'

export const selectPreferedLanguage = async (conversation: ConfigureLanguageConversation, ctx: ConfigureLanguageContext) => {
  if (ctx.message?.chat.id !== env.TELEGRAM_CHAT_ID) {
    return ctx.reply('Unauthorized')
  }
  const message = await ctx.reply('What kind of media do you want to configure ?', {
    reply_markup: new InlineKeyboard().text('🎞️ Movie', 'movie').text('📺 TV Show', 'show'),
  })
  const { callbackQuery: mediaTypeQuery } = await conversation.waitFor('callback_query:data')
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
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
