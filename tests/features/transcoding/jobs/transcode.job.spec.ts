import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { MockPlexClient } from '@tests/mocks/plex.mock'
import { Effect, Fiber, Option } from 'effect'

import { TranscodeScan } from '@/core/runtime.service'
import { getTranscodingStatus, runTranscodeProcess } from '@/features/transcoding/jobs/transcode.job'

class EmptyPlexClient extends MockPlexClient {
  override getSections() {
    return Effect.succeed([])
  }
}

describe('transcode job', () => {
  it.live('scans an empty library', () =>
    Effect.gen(function* () {
      expect(yield* provideTest(runTranscodeProcess, { plex: new EmptyPlexClient() })).toBeUndefined()
    })
  )

  it.live('reports idle status after completion', () =>
    Effect.gen(function* () {
      yield* provideTest(runTranscodeProcess, { plex: new EmptyPlexClient() })
      expect(yield* provideTest(getTranscodingStatus, { plex: new EmptyPlexClient() })).toBeFalse()
    })
  )

  it.live('releases tracked scan state after typed failure, defect, and interruption', () =>
    Effect.gen(function* () {
      const states = yield* provideTest(
        Effect.gen(function* () {
          const scans = yield* TranscodeScan
          const observeCompletion = (task: Effect.Effect<void, Error>) =>
            Effect.gen(function* () {
              expect(yield* scans.start(task)).toBeTrue()
              yield* scans.awaitEmpty
              return yield* scans.isRunning
            })

          const typedFailure = yield* observeCompletion(Effect.fail(new Error('failed')))
          const defect = yield* observeCompletion(Effect.die('defect'))
          expect(yield* scans.start(Effect.never)).toBeTrue()
          yield* scans.clear
          yield* scans.awaitEmpty
          const interruption = yield* scans.isRunning
          return { defect, interruption, typedFailure }
        })
      )

      expect(states).toEqual({ defect: false, interruption: false, typedFailure: false })
    })
  )

  it.live('releases admission after interruption and closes intake atomically', () =>
    Effect.gen(function* () {
      const result = yield* provideTest(
        Effect.gen(function* () {
          const scans = yield* TranscodeScan
          const fiber = yield* Effect.forkChild(scans.run(Effect.never))
          yield* Effect.yieldNow
          yield* Fiber.interrupt(fiber)
          const afterInterrupt = yield* scans.run(Effect.void)
          yield* scans.stopIntake
          const afterStop = yield* scans.start(Effect.never)
          return { afterInterrupt: Option.isSome(afterInterrupt), afterStop }
        })
      )
      expect(result).toEqual({ afterInterrupt: true, afterStop: false })
    })
  )
})
