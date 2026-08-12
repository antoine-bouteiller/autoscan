import { describe, expect, it } from '@tests/it'
import { Deferred, Effect } from 'effect'

import { BackgroundTasks, BackgroundTasksLive } from '@/core/runtime.service'

const run = <Success>(effect: Effect.Effect<Success, never, BackgroundTasks>) => effect.pipe(Effect.provide(BackgroundTasksLive), Effect.scoped)

describe('BackgroundTasks', () => {
  it.effect('tracks accepted work until completion', () =>
    Effect.gen(function* () {
      const result = yield* run(
        Effect.gen(function* () {
          const tasks = yield* BackgroundTasks
          const release = yield* Deferred.make<void>()
          const accepted = yield* tasks.start(Deferred.await(release))
          const waiting = yield* Effect.forkChild(tasks.awaitEmpty)
          yield* Effect.yieldNow
          const waitingBeforeRelease = yield* Effect.sync(() => waiting.pollUnsafe())
          yield* Deferred.succeed(release, undefined)
          yield* tasks.awaitEmpty
          yield* Effect.yieldNow
          return { accepted, waitingBeforeRelease }
        })
      )

      expect(result.accepted).toBeTrue()
      expect(result.waitingBeforeRelease).toBeUndefined()
    })
  )

  it.effect('interrupts tracked work and rejects starts after intake closes', () =>
    Effect.gen(function* () {
      const interrupted = yield* run(
        Effect.gen(function* () {
          const tasks = yield* BackgroundTasks
          const finalized = yield* Deferred.make<void>()
          yield* tasks.start(Effect.never.pipe(Effect.onInterrupt(() => Deferred.succeed(finalized, undefined))))
          yield* tasks.clear
          yield* Deferred.await(finalized)
          yield* tasks.awaitEmpty
          yield* tasks.stopIntake
          const accepted = yield* tasks.start(Effect.void)
          return { accepted, finalized: yield* Deferred.isDone(finalized) }
        })
      )

      expect(interrupted).toEqual({ accepted: false, finalized: true })
    })
  )
})
