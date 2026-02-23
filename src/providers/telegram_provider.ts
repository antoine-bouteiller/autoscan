import env from '@/config/env'
import { logger } from '@/config/logger'
import { handleCallback, handleSetLanguageCommand } from '@/controllers/telegram.controller'
import { TelegramClient } from '@/integrations/telegram.service'
import type { ConversationState } from '@/types/telegram'
import { isError, logError } from '@/utils/error'
import type { TelegramUpdate } from '@/validators/telegram.validator'

export class TelegramProvider {
  private client: TelegramClient
  private running = false
  private conversationState: ConversationState = { step: 'idle' }

  constructor() {
    this.client = new TelegramClient(env.TELEGRAM_TOKEN)
  }

  start(): void {
    if (this.running) {
      logger.warn('bot is already running', 'Telegram')
      return
    }
    this.running = true
    logger.info('bot started', 'Telegram')
    void this.poll()
  }

  async stop(): Promise<void> {
    this.running = false
    logger.info('bot stopped', 'Telegram')
  }

  private async poll(): Promise<void> {
    let offset = 0
    while (this.running) {
      const updates = await this.client.getUpdates(offset)

      if (isError(updates)) {
        logError(updates)
        await new Promise((r) => setTimeout(r, 5000))
        continue
      }

      for (const update of updates) {
        offset = update.update_id + 1
        await this.handleUpdate(update)
      }
    }
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id
    if (chatId !== env.TELEGRAM_CHAT_ID) {
      return
    }

    if (update.message?.text === '/setlanguage') {
      this.conversationState = await handleSetLanguageCommand(this.client, update.message)
      return
    }
    if (update.message?.text === '/cancel') {
      this.conversationState = { step: 'idle' }
      await this.client.sendMessage(chatId, 'Cancelled.')
      return
    }
    if (update.callback_query) {
      this.conversationState = await handleCallback(this.client, chatId, this.conversationState, update.callback_query)
    }
  }
}
