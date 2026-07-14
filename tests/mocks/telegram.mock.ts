import { jest } from 'bun:test'

import { type ITelegramClient } from '@/integrations/telegram/telegram.service'

export const editMessageTextMock = jest.fn().mockResolvedValue(undefined)
export const sendMessageMock = jest.fn().mockResolvedValue(100)
export const answerCallbackQueryMock = jest.fn().mockResolvedValue(undefined)

export class MockTelegramClient implements ITelegramClient {
  editMessageText = editMessageTextMock

  sendMessage = sendMessageMock

  async deleteMessage() {
    return
  }

  answerCallbackQuery = answerCallbackQueryMock

  async getUpdates() {
    return []
  }
}
