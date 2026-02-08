import { conversations, createConversation } from '@grammyjs/conversations'
import { hydrate } from '@grammyjs/hydrate'
import { Bot } from 'grammy'

import env from '@/config/env'
import { logger } from '@/config/logger'
import { selectPreferedLanguage } from '@/features/telegram/controller'
import { type TelegramContext } from '@/features/telegram/types'
import { logError } from '@/utils/error_handler'

export class TelegramProvider {
  private bot: Bot<TelegramContext> | undefined = undefined

  start(): void {
    if (this.bot) {
      logger.warn('bot is already running', 'Telegram')
      return
    }

    this.bot = this.configure()

    void this.bot.start()
    logger.info('bot started', 'Telegram')
  }

  async stop(): Promise<void> {
    if (this.bot) {
      await this.bot.stop()
      logger.info('bot stopped', 'Telegram')
      this.bot = undefined
    }
  }

  private configure(): Bot<TelegramContext> {
    const bot = new Bot<TelegramContext>(env.TELEGRAM_TOKEN)

    bot.use(conversations())

    bot.catch((error) => {
      logError(error, 'Telegram')
      return error.ctx.reply('An error occurred')
    })

    bot.use(createConversation(selectPreferedLanguage, { plugins: [hydrate()] }))

    bot.command('setlanguage', (ctx) => ctx.conversation.enter('selectPreferedLanguage'))
    bot.command('cancel', (ctx) => ctx.reply('Nothing to cancel'))

    return bot
  }
}
