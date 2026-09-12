import { beforeEach } from 'bun:test'

import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { MockBazarrClient } from '@tests/mocks/bazarr.mock'
import { MockPlexClient } from '@tests/mocks/plex.mock'
import { MockTelegramClient, sendMessageMock } from '@tests/utils'
import { Deferred, Effect } from 'effect'

import { BackgroundTasks } from '@/core/runtime.service'
import { subtitleScanCommand } from '@/features/subtitle_scan/commands/subtitle_scan.command'

class EmptyPlexClient extends MockPlexClient {
  override get getSections() {
    return Effect.succeed([])
  }
}

class BlockedBazarrClient extends MockBazarrClient {
  private readonly entered: Deferred.Deferred<void>
  private readonly finish: Deferred.Deferred<void>

  constructor(entered: Deferred.Deferred<void>, finish: Deferred.Deferred<void>) {
    super()
    this.entered = entered
    this.finish = finish
  }

  override get getProfiles() {
    return Deferred.succeed(this.entered, undefined).pipe(Effect.andThen(Deferred.await(this.finish)), Effect.as([]))
  }
}

const client = new MockTelegramClient()
const message = { chat: { id: 1 }, message_id: 1, text: '/subtitlescan' }

describe('subtitle scan command', () => {
  beforeEach(() => {
    sendMessageMock.mockClear().mockResolvedValue(100)
  })

  it.live('returns idle while work is blocked, refuses overlap, and sends no pass report', () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>()
      const finish = yield* Deferred.make<void>()
      yield* provideTest(
        Effect.gen(function* () {
          expect(yield* subtitleScanCommand(client, message)).toEqual({ step: 'idle' })
          yield* Deferred.await(entered)
          expect(yield* subtitleScanCommand(client, message)).toEqual({ step: 'idle' })
          expect(sendMessageMock.mock.calls).toEqual([
            [1, 'Starting subtitle scan...', undefined],
            [1, 'A subtitle scan is already running.', undefined],
          ])
          yield* Deferred.succeed(finish, undefined)
          yield* (yield* BackgroundTasks).awaitEmpty
          expect(sendMessageMock).toHaveBeenCalledTimes(2)
          expect(yield* subtitleScanCommand(client, message)).toEqual({ step: 'idle' })
          yield* (yield* BackgroundTasks).awaitEmpty
          expect(sendMessageMock).toHaveBeenCalledTimes(3)
          expect(sendMessageMock).toHaveBeenLastCalledWith(1, 'Starting subtitle scan...', undefined)
        }),
        { bazarr: new BlockedBazarrClient(entered, finish), plex: new EmptyPlexClient() }
      )
    })
  )
})
