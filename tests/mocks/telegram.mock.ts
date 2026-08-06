import { jest } from 'bun:test'

import { Effect } from 'effect'

import { type ITelegramClient } from '@/integrations/telegram/telegram.service'
import { type TelegramUpdate } from '@/integrations/telegram/telegram.validator'
import { NetworkError } from '@/shared/errors/network'

export const editMessageTextMock = jest
  .fn<(chatId: number, messageId: number, options: Parameters<ITelegramClient['editMessageText']>[2]) => Promise<void>>()
  .mockResolvedValue(undefined)
export const sendMessageMock = jest
  .fn<(chatId: number, text: string, options?: Parameters<ITelegramClient['sendMessage']>[2]) => Promise<number>>()
  .mockResolvedValue(100)
export const answerCallbackQueryMock = jest.fn<(callbackQueryId: string) => Promise<void>>().mockResolvedValue(undefined)
const getUpdatesMock = jest.fn<(offset?: number) => Promise<TelegramUpdate[]>>().mockResolvedValue([])

const fromPromise = <Value>(run: () => Promise<Value>) =>
  Effect.tryPromise({
    catch: (cause) => new NetworkError({ cause, originalMessage: String(cause), serviceName: 'TelegramTest' }),
    try: run,
  })

export class MockTelegramClient implements ITelegramClient {
  editMessageText(chatId: number, messageId: number, options: Parameters<ITelegramClient['editMessageText']>[2]) {
    return fromPromise(() => editMessageTextMock(chatId, messageId, options))
  }

  sendMessage(chatId: number, text: string, options?: Parameters<ITelegramClient['sendMessage']>[2]) {
    return fromPromise(() => sendMessageMock(chatId, text, options))
  }

  deleteMessage() {
    return Effect.void
  }

  answerCallbackQuery(callbackQueryId: string) {
    return fromPromise(() => answerCallbackQueryMock(callbackQueryId))
  }

  getUpdates(offset?: number) {
    return fromPromise(() => getUpdatesMock(offset))
  }
}
