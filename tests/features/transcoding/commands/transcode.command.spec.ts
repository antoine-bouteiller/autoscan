import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'

import { container, TOKENS } from '#/core/container'
import { transcodeCommand } from '#/features/transcoding/commands/transcode.command'
import { type TelegramMessageIn } from '#/integrations/telegram/telegram.validator'

import { sendMessageMock } from '../../../mocks/telegram.mock.js'
import { MockTelegramClient } from '../../../utils.ts'

const makeMessage = (chatId: number): TelegramMessageIn => ({
  chat: { id: chatId },
  message_id: 1,
})

describe('transcodeCommand', () => {
  const client = new MockTelegramClient()
  const plexClient = container.resolve(TOKENS.PLEX_CLIENT)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('should send "starting" message when not already running', async () => {
    vi.spyOn(plexClient, 'getSections').mockResolvedValue([])

    const state = await transcodeCommand(client, makeMessage(42))

    expect(state).toEqual({ step: 'idle' })
    expect(sendMessageMock).toHaveBeenCalledWith(42, 'Starting transcode process...')
  })

  test('should tell user process already running when invoked while in progress', async () => {
    let resolveSections: ((value: never[]) => void) | undefined
    vi.spyOn(plexClient, 'getSections').mockReturnValue(
      new Promise((resolve) => {
        resolveSections = resolve
      })
    )

    await transcodeCommand(client, makeMessage(42))
    sendMessageMock.mockClear()

    const state = await transcodeCommand(client, makeMessage(42))

    expect(state).toEqual({ step: 'idle' })
    expect(sendMessageMock).toHaveBeenCalledWith(42, 'Transcode process is already running.')

    resolveSections?.([])
  })
})
