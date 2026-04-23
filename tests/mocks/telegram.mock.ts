import { vi } from 'vite-plus/test'

import { type ITelegramClient } from '#/integrations/telegram/telegram.service'

export const editMessageTextMock = vi.fn().mockResolvedValue(undefined)
export const sendMessageMock = vi.fn().mockResolvedValue(100)
export const answerCallbackQueryMock = vi.fn().mockResolvedValue(undefined)

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
