import { describe, expect, it } from '@tests/it'
import { Effect } from 'effect'

import { TraktAuthenticationTasks, TraktAuthenticationTasksLive } from '@/features/trakt_sync/services/authentication.service'

const run = <Success>(effect: Effect.Effect<Success, never, TraktAuthenticationTasks>) =>
  effect.pipe(Effect.provide(TraktAuthenticationTasksLive), Effect.scoped)

describe('TraktAuthenticationTasks', () => {
  it.effect('owns at most one task per chat id', () =>
    Effect.gen(function* () {
      const result = yield* run(
        Effect.gen(function* () {
          const tasks = yield* TraktAuthenticationTasks
          const first = yield* tasks.start(1, Effect.never)
          const duplicate = yield* tasks.start(1, Effect.never)
          const otherChat = yield* tasks.start(2, Effect.never)
          yield* Effect.yieldNow
          const running = yield* tasks.isRunning(1)
          yield* tasks.clear
          yield* tasks.awaitEmpty
          return { duplicate, first, otherChat, running }
        })
      )
      expect(result).toEqual({ duplicate: false, first: true, otherChat: true, running: true })
    })
  )

  it.effect('admits only one of concurrent duplicate starts', () =>
    Effect.gen(function* () {
      const accepted = yield* run(
        Effect.gen(function* () {
          const tasks = yield* TraktAuthenticationTasks
          const results = yield* Effect.all([tasks.start(1, Effect.never), tasks.start(1, Effect.never)], { concurrency: 'unbounded' })
          yield* tasks.clear
          return results
        })
      )

      expect(accepted.filter(Boolean)).toHaveLength(1)
    })
  )

  it.effect('removes completed tasks and stops intake', () =>
    Effect.gen(function* () {
      const result = yield* run(
        Effect.gen(function* () {
          const tasks = yield* TraktAuthenticationTasks
          expect(yield* tasks.start(1, Effect.void)).toBeTrue()
          yield* tasks.awaitEmpty
          const running = yield* tasks.isRunning(1)
          yield* tasks.stopIntake
          const accepted = yield* tasks.start(2, Effect.never)
          return { accepted, running }
        })
      )
      expect(result).toEqual({ accepted: false, running: false })
    })
  )
})
