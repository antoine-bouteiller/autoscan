import { vi } from 'vitest'

import type { ITelegramClient } from '@/integrations/telegram.service'

export const editMessageTextMock = vi.fn().mockResolvedValue(undefined)

export class MockTelegramClient implements ITelegramClient {
  editMessageText = editMessageTextMock

  async sendMessage() {
    return 100
  }
  async deleteMessage() {
    return
  }
  async answerCallbackQuery() {
    return
  }
  async getUpdates() {
    return []
  }
}
