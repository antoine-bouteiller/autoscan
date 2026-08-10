import { describe, expect, test } from 'bun:test'

import { Effect } from 'effect'

import { TraktAuthenticationTasks, TraktAuthenticationTasksLive } from '@/features/trakt_sync/services/authentication.service'

const run = <Success>(effect: Effect.Effect<Success, never, TraktAuthenticationTasks>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TraktAuthenticationTasksLive), Effect.scoped))

describe('TraktAuthenticationTasks', () => {
  test('owns at most one task per chat id', async () => {
    const result = await run(
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
  test('admits only one of concurrent duplicate starts', async () => {
    const accepted = await run(
      Effect.gen(function* () {
        const tasks = yield* TraktAuthenticationTasks
        const results = yield* Effect.all([tasks.start(1, Effect.never), tasks.start(1, Effect.never)], { concurrency: 'unbounded' })
        yield* tasks.clear
        return results
      })
    )

    expect(accepted.filter(Boolean)).toHaveLength(1)
  })

  test('removes completed tasks and stops intake', async () => {
    const result = await run(
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
})
