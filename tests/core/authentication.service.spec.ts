import { describe, expect, it } from '@tests/it'
import { Effect } from 'effect'

import { AuthenticationTasks, AuthenticationTasksLive } from '@/core/runtime.service'

const run = <Success>(effect: Effect.Effect<Success, never, AuthenticationTasks>) =>
  effect.pipe(Effect.provide(AuthenticationTasksLive), Effect.scoped)

describe('AuthenticationTasks', () => {
  it.effect('owns at most one task per key', () =>
    Effect.gen(function* () {
      const result = yield* run(
        Effect.gen(function* () {
          const tasks = yield* AuthenticationTasks
          const first = yield* tasks.start('plex:1', Effect.never)
          const duplicate = yield* tasks.start('plex:1', Effect.never)
          const otherKey = yield* tasks.start('plex:2', Effect.never)
          yield* Effect.yieldNow
          const running = yield* tasks.isRunning('plex:1')
          yield* tasks.clear
          yield* tasks.awaitEmpty
          return { duplicate, first, otherKey, running }
        })
      )
      expect(result).toEqual({ duplicate: false, first: true, otherKey: true, running: true })
    })
  )

  it.effect('admits only one of concurrent duplicate starts', () =>
    Effect.gen(function* () {
      const accepted = yield* run(
        Effect.gen(function* () {
          const tasks = yield* AuthenticationTasks
          const results = yield* Effect.all([tasks.start('plex:1', Effect.never), tasks.start('plex:1', Effect.never)], {
            concurrency: 'unbounded',
          })
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
          const tasks = yield* AuthenticationTasks
          expect(yield* tasks.start('plex:1', Effect.void)).toBeTrue()
          yield* tasks.awaitEmpty
          const running = yield* tasks.isRunning('plex:1')
          yield* tasks.stopIntake
          const accepted = yield* tasks.start('plex:1', Effect.never)
          return { accepted, running }
        })
      )
      expect(result).toEqual({ accepted: false, running: false })
    })
  )
})
