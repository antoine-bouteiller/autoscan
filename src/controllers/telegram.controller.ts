import { asc, eq } from 'drizzle-orm'
import { Effect, Schema } from 'effect'
import { InlineKeyboard } from 'grammy'

import { DatabaseService } from '@/config/database'
import { media as mediaTable } from '@/database/schema'
import { MediaType } from '@/schemas/plex'
import { type AppRuntime, createMenu } from '@/services/telegram.service'
import type { ConfigureLanguageContext, ConfigureLanguageConversation } from '@/types/telegram'

export const selectPreferedLanguage = async (
  conversation: ConfigureLanguageConversation,
  ctx: ConfigureLanguageContext,
  chatId: number,
  runtime: AppRuntime
) => {
  if (ctx.message?.chat.id !== chatId) {
    return ctx.reply('Unauthorized')
  }
  const message = await ctx.reply('What kind of media do you want to configure ?', {
    reply_markup: new InlineKeyboard().text('Movie', 'movie').text('TV Show', 'show'),
  })
  const { callbackQuery: mediaTypeQuery } = await conversation.waitFor('callback_query:data')

  const mediaType = Schema.decodeUnknownSync(MediaType)(mediaTypeQuery.data)

  const media = await conversation.external(() =>
    runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* DatabaseService
        return yield* Effect.promise(() =>
          db.select().from(mediaTable).where(eq(mediaTable.type, mediaType)).orderBy(asc(mediaTable.title)).limit(100)
        )
      })
    )
  )

  await message.editText(`Wich ${mediaType} do you want to configure ?`, {
    reply_markup: createMenu({
      mediaType,
      menuConversation: conversation,
      menuMedia: media,
      message,
      page: 0,
      runtime,
    }),
  })

  await conversation.waitUntil(() => false)
}
