import { beforeEach } from 'bun:test'

import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
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

  it.live('starts a scan', () =>
    Effect.gen(function* () {
      expect(yield* provideTest(transcodeCommand(client, message), { plex: new SlowPlexClient() })).toEqual({ step: 'idle' })
      expect(sendMessageMock).toHaveBeenCalledWith(1, 'Starting transcode process...', undefined)
    })
  )

  it.live('rejects a duplicate scan', () =>
    Effect.gen(function* () {
      yield* provideTest(
        Effect.gen(function* () {
          yield* transcodeCommand(client, message)
          yield* transcodeCommand(client, message)
        }),
        { plex: new SlowPlexClient() }
      )
      expect(sendMessageMock).toHaveBeenLastCalledWith(1, 'Transcode process is already running.', undefined)
    })
  )
})
