import { beforeEach } from 'bun:test'

import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { MockPlexClient } from '@tests/mocks/plex.mock'
import { MockTelegramClient, sendMessageMock } from '@tests/utils'
import { Effect } from 'effect'

import { subtitleScanCommand } from '@/features/transcoding/commands/subtitle_scan.command'

class EmptyPlexClient extends MockPlexClient {
  override get getSections() {
    return Effect.succeed([])
  }
}

const client = new MockTelegramClient()
const message = { chat: { id: 1 }, message_id: 1, text: '/subtitlescan' }

describe('subtitleScanCommand', () => {
  beforeEach(() => {
    sendMessageMock.mockClear().mockResolvedValue(100)
  })

  it.live('returns idle immediately', () =>
    Effect.gen(function* () {
      expect(yield* provideTest(subtitleScanCommand(client, message), { plex: new EmptyPlexClient() })).toEqual({ step: 'idle' })
      expect(sendMessageMock).toHaveBeenCalledWith(1, 'Starting subtitle scan...', undefined)
    })
  )

  it.live('reports an empty scan', () =>
    Effect.gen(function* () {
      yield* provideTest(
        Effect.gen(function* () {
          yield* subtitleScanCommand(client, message)
          yield* Effect.sleep(1)
        }),
        { plex: new EmptyPlexClient() }
      )
      expect(sendMessageMock).toHaveBeenCalledWith(1, 'All media have matching subtitles.', undefined)
    })
  )
})
