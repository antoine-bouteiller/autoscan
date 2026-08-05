import { beforeEach, describe, expect, test } from 'bun:test'

import { runTest } from '@tests/effect'
import { MockPlexClient } from '@tests/mocks/plex.mock'
import { MockTelegramClient, sendMessageMock } from '@tests/utils'
import { Effect } from 'effect'

import { subtitleScanCommand } from '@/features/transcoding/commands/subtitle_scan.command'

class EmptyPlexClient extends MockPlexClient {
  override getSections() {
    return Effect.succeed([])
  }
}

const client = new MockTelegramClient()
const message = { chat: { id: 1 }, message_id: 1, text: '/subtitlescan' }

describe('subtitleScanCommand', () => {
  beforeEach(() => {
    sendMessageMock.mockClear().mockResolvedValue(100)
  })

  test('returns idle immediately', async () => {
    expect(await runTest(subtitleScanCommand(client, message), { plex: new EmptyPlexClient() })).toEqual({ step: 'idle' })
    expect(sendMessageMock).toHaveBeenCalledWith(1, 'Starting subtitle scan...', undefined)
  })

  test('reports an empty scan', async () => {
    await runTest(
      Effect.gen(function* () {
        yield* subtitleScanCommand(client, message)
        yield* Effect.sleep(1)
      }),
      { plex: new EmptyPlexClient() }
    )
    expect(sendMessageMock).toHaveBeenCalledWith(1, 'All media have matching subtitles.', undefined)
  })
})
