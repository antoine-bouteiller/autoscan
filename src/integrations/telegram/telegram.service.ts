import { Effect } from 'effect'
import { type HttpClient as EffectHttpClient } from 'effect/unstable/http'

import { getUpdatesResponseSchema, sendMessageResponseSchema, type TelegramUpdate } from '@/integrations/telegram/telegram.validator'
import { type InlineKeyboardMarkup } from '@/providers/telegram/types'
import { type HttpClientError } from '@/shared/types/http_client'
import { httpClient } from '@/shared/utils/http_client'

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
  readonly answerCallbackQuery: (callbackQueryId: string) => Effect.Effect<void, HttpClientError>
  readonly deleteMessage: (chatId: number, messageId: number) => Effect.Effect<void, HttpClientError>
  readonly editMessageText: (chatId: number, messageId: number, options: EditMessageOptions) => Effect.Effect<void, HttpClientError>
  readonly getUpdates: (offset?: number) => Effect.Effect<TelegramUpdate[], HttpClientError>
  readonly sendMessage: (chatId: number, text: string, options?: SendMessageOptions) => Effect.Effect<number, HttpClientError>
}

const UPDATE_TIMEOUT = 30
const LONG_POLL_DEADLINE = 40_000

export class TelegramClient implements ITelegramClient {
  private readonly client: ReturnType<typeof httpClient>

  constructor(token: string, transport: EffectHttpClient.HttpClient) {
    this.client = httpClient({
      baseUrl: `https://api.telegram.org/bot${token}`,
      headers: { 'Content-Type': 'application/json' },
      serviceName: 'Telegram',
      transport,
    })
  }

  getUpdates(offset?: number) {
    return this.client
      .post('getUpdates', {
        body: { offset, timeout: UPDATE_TIMEOUT },
        timeout: LONG_POLL_DEADLINE,
        validator: getUpdatesResponseSchema,
      })
      .pipe(Effect.map((response) => response.result))
  }

  sendMessage(chatId: number, text: string, options?: SendMessageOptions) {
    return this.client
      .post('sendMessage', {
        body: { chat_id: chatId, parse_mode: options?.parseMode, reply_markup: options?.replyMarkup, text },
        validator: sendMessageResponseSchema,
      })
      .pipe(Effect.map((response) => response.result.message_id))
  }

  editMessageText(chatId: number, messageId: number, options: EditMessageOptions) {
    return this.client.post('editMessageText', {
      body: { chat_id: chatId, message_id: messageId, parse_mode: options.parseMode, reply_markup: options.replyMarkup, text: options.text },
    })
  }

  deleteMessage(chatId: number, messageId: number) {
    return this.client.post('deleteMessage', { body: { chat_id: chatId, message_id: messageId } })
  }

  answerCallbackQuery(callbackQueryId: string) {
    return this.client.post('answerCallbackQuery', { body: { callback_query_id: callbackQueryId } })
  }
}
