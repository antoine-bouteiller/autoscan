import { beforeEach, describe, expect, jest, spyOn, test } from 'bun:test'

import { container, TOKENS } from '#/core/container'
import { subtitleScanCommand } from '#/features/transcoding/commands/subtitle_scan.command'
import { type TelegramMessageIn } from '#/integrations/telegram/telegram.validator'
import { sendMessageMock } from '#tests/mocks/telegram.mock'
import { MockTelegramClient } from '#tests/utils'

const makeMessage = (chatId: number): TelegramMessageIn => ({
  chat: { id: chatId },
  message_id: 1,
})

describe('subtitleScanCommand', () => {
  const client = new MockTelegramClient()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('should send starting message and return idle immediately', async () => {
    const plexClient = container.resolve(TOKENS.PLEX_CLIENT)
    spyOn(plexClient, 'getSections').mockResolvedValue([])

    const state = await subtitleScanCommand(client, makeMessage(42))

    expect(state).toEqual({ step: 'idle' })
    expect(sendMessageMock).toHaveBeenCalledWith(42, 'Starting subtitle scan...')
  })

  test('should send default message when nothing is missing or out of sync', async () => {
    const plexClient = container.resolve(TOKENS.PLEX_CLIENT)
    spyOn(plexClient, 'getSections').mockResolvedValue([])

    await subtitleScanCommand(client, makeMessage(42))

    await new Promise((resolve) => setImmediate(resolve))

    expect(sendMessageMock).toHaveBeenCalledWith(42, 'All media have matching subtitles.')
  })
})
