import { describe, expect, test } from 'bun:test'

import { runTest } from '@tests/effect'
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
  test('scans an empty library', async () => {
    expect(await runTest(runTranscodeProcess, { plex: new EmptyPlexClient() })).toBeUndefined()
  })

  test('reports idle status after completion', async () => {
    await runTest(runTranscodeProcess, { plex: new EmptyPlexClient() })
    expect(await runTest(getTranscodingStatus, { plex: new EmptyPlexClient() })).toBeFalse()
  })
  test('releases tracked scan state after typed failure, defect, and interruption', async () => {
    const states = await runTest(
      Effect.gen(function* () {
        const scans = yield* TranscodeScan
        const observeCompletion = (task: Effect.Effect<void, unknown>) =>
          Effect.gen(function* () {
            expect(yield* scans.start(task)).toBeTrue()
            yield* scans.awaitEmpty
            return yield* scans.isRunning
          })

        const typedFailure = yield* observeCompletion(Effect.fail('failed'))
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

  test('releases admission after interruption and closes intake atomically', async () => {
    const result = await runTest(
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
})
