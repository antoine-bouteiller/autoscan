import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'

import { container, TOKENS } from '#core/container'
import { subtitleScanCommand } from '#features/transcoding/commands/subtitle_scan.command'
import { type IPlexClient } from '#integrations/plex/plex.service'
import { type TelegramMessageIn } from '#integrations/telegram/telegram.validator'

import { sendMessageMock } from '../../../mocks/telegram.mock.js'
import { MockTelegramClient } from '../../../utils.ts'

const makeMessage = (chatId: number): TelegramMessageIn => ({
  chat: { id: chatId },
  message_id: 1,
})

describe('subtitleScanCommand', () => {
  const client = new MockTelegramClient()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('should send starting message and return idle immediately', async () => {
    const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)
    vi.spyOn(plexClient, 'getSections').mockResolvedValue([])

    const state = await subtitleScanCommand(client, makeMessage(42))

    expect(state).toEqual({ step: 'idle' })
    expect(sendMessageMock).toHaveBeenCalledWith(42, 'Starting subtitle scan...')
  })

  test('should send default message when nothing is missing or out of sync', async () => {
    const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)
    vi.spyOn(plexClient, 'getSections').mockResolvedValue([])

    await subtitleScanCommand(client, makeMessage(42))

    await new Promise((resolve) => setImmediate(resolve))

    expect(sendMessageMock).toHaveBeenCalledWith(42, 'All media have matching subtitles.')
  })
})
