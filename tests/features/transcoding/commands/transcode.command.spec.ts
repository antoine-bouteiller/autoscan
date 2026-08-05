import { beforeEach, describe, expect, test } from 'bun:test'

import { runTest } from '@tests/effect'
import { MockPlexClient } from '@tests/mocks/plex.mock'
import { MockTelegramClient, sendMessageMock } from '@tests/utils'
import { Effect } from 'effect'

import { transcodeCommand } from '@/features/transcoding/commands/transcode.command'

class SlowPlexClient extends MockPlexClient {
  override getSections() {
    return Effect.never
  }
}

const client = new MockTelegramClient()
const message = { chat: { id: 1 }, message_id: 1, text: '/transcode' }

describe('transcodeCommand', () => {
  beforeEach(() => {
    sendMessageMock.mockClear().mockResolvedValue(100)
  })

  test('starts a scan', async () => {
    expect(await runTest(transcodeCommand(client, message), { plex: new SlowPlexClient() })).toEqual({ step: 'idle' })
    expect(sendMessageMock).toHaveBeenCalledWith(1, 'Starting transcode process...', undefined)
  })

  test('rejects a duplicate scan', async () => {
    await runTest(
      Effect.gen(function* () {
        yield* transcodeCommand(client, message)
        yield* transcodeCommand(client, message)
      }),
      { plex: new SlowPlexClient() }
    )
    expect(sendMessageMock).toHaveBeenLastCalledWith(1, 'Transcode process is already running.', undefined)
  })
})
