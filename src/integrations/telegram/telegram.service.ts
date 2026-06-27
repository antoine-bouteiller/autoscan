import { getUpdatesResponseSchema, sendMessageResponseSchema, type TelegramUpdate } from '#/integrations/telegram/telegram.validator'
import { type InlineKeyboardMarkup } from '#/providers/telegram/types'
import { isError, logError } from '#/shared/utils/error'
import { httpClient } from '#/shared/utils/http_client'

interface SendMessageOptions {
  replyMarkup?: InlineKeyboardMarkup
  parseMode?: string
}

interface EditMessageOptions {
  text: string
  replyMarkup?: InlineKeyboardMarkup
  parseMode?: string
}

export interface ITelegramClient {
  getUpdates: (offset?: number) => Promise<TelegramUpdate[] | Error>
  sendMessage: (chatId: number, text: string, options?: SendMessageOptions) => Promise<number | undefined>
  editMessageText: (chatId: number, messageId: number, options: EditMessageOptions) => Promise<void>
  deleteMessage: (chatId: number, messageId: number) => Promise<void>
  answerCallbackQuery: (callbackQueryId: string) => Promise<void>
}

const UPDATE_TIMEOUT = 30

export class TelegramClient implements ITelegramClient {
  private readonly client: ReturnType<typeof httpClient>

  constructor(token: string) {
    this.client = httpClient({
      baseUrl: `https://api.telegram.org/bot${token}`,
      headers: { 'Content-Type': 'application/json' },
      serviceName: 'Telegram',
    })
  }

  async getUpdates(offset?: number) {
    const result = await this.client.post('getUpdates', {
      body: { offset, timeout: UPDATE_TIMEOUT },
      validator: getUpdatesResponseSchema,
    })
    if (isError(result)) {
      return result
    }
    return result.result
  }

  async sendMessage(chatId: number, text: string, options?: SendMessageOptions): Promise<number | undefined> {
    const result = await this.client.post('sendMessage', {
      body: { chat_id: chatId, parse_mode: options?.parseMode, reply_markup: options?.replyMarkup, text },
      validator: sendMessageResponseSchema,
    })
    if (isError(result)) {
      logError(result, 'Telegram')
      return undefined
    }
    return result.result.message_id
  }

  async editMessageText(chatId: number, messageId: number, options: EditMessageOptions): Promise<void> {
    const result = await this.client.post('editMessageText', {
      body: { chat_id: chatId, message_id: messageId, parse_mode: options.parseMode, reply_markup: options.replyMarkup, text: options.text },
    })
    if (isError(result)) {
      logError(result, 'Telegram')
    }
  }

  async deleteMessage(chatId: number, messageId: number): Promise<void> {
    const result = await this.client.post('deleteMessage', {
      body: { chat_id: chatId, message_id: messageId },
    })
    if (isError(result)) {
      logError(result, 'Telegram')
    }
  }

  async answerCallbackQuery(callbackQueryId: string): Promise<void> {
    const result = await this.client.post('answerCallbackQuery', {
      body: { callback_query_id: callbackQueryId },
    })
    if (isError(result)) {
      logError(result, 'Telegram')
    }
  }
}
