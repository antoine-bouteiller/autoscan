import { conversations, createConversation } from '@grammyjs/conversations'
import { hydrate } from '@grammyjs/hydrate'
import { Bot } from 'grammy'

import type { TelegramContext } from '@/types/telegram'

import { selectMediaType } from '@/app/controllers/telegram_controller'
import env from '@/config/env'
import { logger } from '@/config/logger'

const bot = new Bot<TelegramContext>(env.TELEGRAM_TOKEN)

bot.use(conversations())

bot.catch((error) => {
  logger.error(error.message)
  return error.ctx.reply('An error occurred')
})

bot.use(createConversation(selectMediaType, { plugins: [hydrate()] }))

bot.command('setlanguage', (ctx) => ctx.conversation.enter('selectMediaType'))

bot.command('cancel', async (ctx) => {
  return ctx.reply('Nothing to cancel')
})

logger.info('Telegram bot starting...')
void bot.start()
logger.info('Telegram bot started')
