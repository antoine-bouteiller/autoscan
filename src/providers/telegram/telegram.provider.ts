import env from '#/config/env'
import { logger } from '#/config/logger'
import { container, TOKENS } from '#/core/container'
import { type ITelegramClient } from '#/integrations/telegram/telegram.service'
import { type TelegramCallbackQuery, type TelegramMessageIn, type TelegramUpdate } from '#/integrations/telegram/telegram.validator'
import { type ConversationState } from '#/providers/telegram/types'
import { isError, logError } from '#/shared/utils/error'

export type CommandHandler = (client: ITelegramClient, message: TelegramMessageIn) => Promise<ConversationState>
type CallbackHandler = (
  client: ITelegramClient,
  chatId: number,
  params: { state: ConversationState; callback: TelegramCallbackQuery }
) => Promise<ConversationState>
export interface Conversation {
  onCommand: CommandHandler
  onCallback: CallbackHandler
}

export class TelegramProvider {
  private readonly client: ITelegramClient
  private running = false
  private conversationState: ConversationState = { step: 'idle' }
  private readonly commands = new Map<string, CommandHandler>()
  private readonly conversations = new Map<string, Conversation>()
  private activeConversationKey?: string

  constructor() {
    this.client = container.resolve(TOKENS.TELEGRAM_CLIENT)
  }

  registerCommand(command: string, handler: CommandHandler): this {
    this.commands.set(command, handler)
    return this
  }

  registerConversation(command: string, conversation: Conversation): this {
    this.conversations.set(command, conversation)
    return this
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
    let errorDelay = 5000
    const maxErrorDelay = 5 * 60 * 1000

    while (this.running) {
      const updates = await this.client.getUpdates(offset)

      if (isError(updates)) {
        logError(updates)
        await new Promise((resolve) => setTimeout(resolve, errorDelay))
        errorDelay = Math.min(errorDelay * 2, maxErrorDelay)
        continue
      }

      errorDelay = 5000

      for (const update of updates) {
        offset = update.update_id + 1
        await this.handleUpdate(update)
      }
    }
  }

  private async handleCancel(chatId: number) {
    if (this.conversationState.step === 'idle') {
      await this.client.sendMessage(chatId, 'No operation in progress')
    } else {
      this.conversationState = { step: 'idle' }
      this.activeConversationKey = undefined
      await this.client.sendMessage(chatId, 'Cancelled.')
    }
  }

  private async handleMessage(message: TelegramMessageIn) {
    const { text } = message

    if (text === undefined) {
      return
    }

    const conversation = this.conversations.get(text)
    if (conversation) {
      this.activeConversationKey = text
      this.conversationState = await conversation.onCommand(this.client, message)
      if (this.conversationState.step === 'idle') {
        this.activeConversationKey = undefined
      }
      return
    }

    const handler = this.commands.get(text)
    if (handler) {
      this.conversationState = await handler(this.client, message)
    }
  }

  private async handleCallBack(chatId: number, callback: TelegramCallbackQuery) {
    if (this.activeConversationKey === undefined) {
      return
    }

    const conversation = this.conversations.get(this.activeConversationKey)
    if (conversation) {
      this.conversationState = await conversation.onCallback(this.client, chatId, { callback, state: this.conversationState })
      if (this.conversationState.step === 'idle') {
        this.activeConversationKey = undefined
      }
    }
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id

    if (chatId !== env.TELEGRAM_CHAT_ID) {
      logger.warn(`(Telegram) Unknown chat sender ${chatId}`)
      return
    }

    const text = update.message?.text

    if (text === '/cancel') {
      await this.handleCancel(chatId)
      return
    }

    if (update.message && this.activeConversationKey === undefined) {
      await this.handleMessage(update.message)
      return
    }

    if (update.callback_query) {
      await this.handleCallBack(chatId, update.callback_query)
    }
  }
}
