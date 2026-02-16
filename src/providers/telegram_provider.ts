import { conversations, createConversation } from '@grammyjs/conversations'
import { hydrate } from '@grammyjs/hydrate'
import { Effect, Layer, ManagedRuntime, Redacted } from 'effect'
import { Bot } from 'grammy'

import { AppConfig } from '@/config/app_config'
import { DatabaseService } from '@/config/database'
import { selectPreferedLanguage } from '@/controllers/telegram.controller'
import type { ConfigureLanguageContext, ConfigureLanguageConversation, TelegramContext } from '@/types/telegram'

interface TelegramServiceApi {
  bot: Bot<TelegramContext> | undefined
}

export class TelegramService extends Effect.Service<TelegramService>()('TelegramService', {
  dependencies: [AppConfig.Default, DatabaseService.Default],
  scoped: Effect.gen(function* () {
    const config = yield* AppConfig
    const dbService = yield* DatabaseService
    if (config.NODE_ENV === 'development') {
      yield* Effect.logInfo('Telegram bot disabled in development').pipe(Effect.annotateLogs({ context: 'Telegram' }))
      return { bot: undefined }
    }

    const runtime = ManagedRuntime.make(Layer.succeed(DatabaseService, dbService))

    const bot = new Bot<TelegramContext>(Redacted.value(config.TELEGRAM_TOKEN))

    bot.use(conversations())

    bot.catch((error) => {
      Effect.logError(error.message).pipe(Effect.annotateLogs({ context: 'Telegram' }), Effect.runFork)
      return error.ctx.reply('An error occurred')
    })

    const conversationHandler = (conversation: ConfigureLanguageConversation, ctx: ConfigureLanguageContext) =>
      selectPreferedLanguage(conversation, ctx, config.TELEGRAM_CHAT_ID, runtime)

    bot.use(createConversation(conversationHandler, { plugins: [hydrate()] }))

    bot.command('setlanguage', (ctx) => ctx.conversation.enter('selectPreferedLanguage'))
    bot.command('cancel', (ctx) => ctx.reply('Nothing to cancel'))

    void bot.start()
    yield* Effect.logInfo('Bot started').pipe(Effect.annotateLogs({ context: 'Telegram' }))

    yield* Effect.addFinalizer(() =>
      Effect.promise(() => bot.stop()).pipe(Effect.tap(() => Effect.logInfo('Bot stopped').pipe(Effect.annotateLogs({ context: 'Telegram' }))))
    )

    const service: TelegramServiceApi = { bot }
    return service
  }),
}) {}
