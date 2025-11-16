import { conversations, createConversation } from '@grammyjs/conversations'
import { hydrate } from '@grammyjs/hydrate'
import { Bot } from 'grammy'

import type { TelegramContext } from '@/types/telegram'

import { selectMediaType } from '@/app/controllers/telegram/language_command'
import env from '@/config/env'
import { logger } from '@/config/logger'

class TelegramProvider {
  private bot: Bot<TelegramContext> | undefined = undefined

  private configure(): Bot<TelegramContext> {
    const bot = new Bot<TelegramContext>(env.TELEGRAM_TOKEN)

    bot.use(conversations())

    bot.catch((error) => {
      logger.error({ error: error.message }, 'Telegram bot error')
      return error.ctx.reply('An error occurred')
    })

    bot.use(createConversation(selectMediaType, { plugins: [hydrate()] }))

    bot.command('setlanguage', (ctx) => ctx.conversation.enter('selectMediaType'))
    bot.command('cancel', (ctx) => ctx.reply('Nothing to cancel'))

    return bot
  }

  start(): void {
    if (this.bot) {
      logger.warn('Telegram bot is already running')
      return
    }

    this.bot = this.configure()

    void this.bot.start()
    logger.info('Telegram bot started')
  }

  async stop(): Promise<void> {
    if (this.bot) {
      await this.bot.stop()
      logger.info('Telegram bot stopped')
      this.bot = undefined
    }
  }
}

let telegramProvider: TelegramProvider | undefined

export const getTelegramProvider = (): TelegramProvider => {
  telegramProvider ??= new TelegramProvider()
  return telegramProvider
}
