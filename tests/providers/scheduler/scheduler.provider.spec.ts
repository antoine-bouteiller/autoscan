import { runTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { Effect } from 'effect'

import { SchedulerProvider } from '@/providers/scheduler/scheduler.provider'

describe('SchedulerProvider', () => {
  it.effect('runs registered jobs through the tracked runtime', () =>
    Effect.gen(function* () {
      let runJob: (() => Promise<void>) | undefined
      let runs = 0
      const scheduler = new SchedulerProvider({
        cron: (_pattern, handler) => {
          runJob = handler
          return { stop: () => undefined }
        },
        runPromise: (effect) => runTest(effect),
      })
      scheduler.register({ handler: Effect.sync(() => runs++), name: 'job', pattern: '* * * * *' })
      yield* Effect.promise(() => runJob?.() ?? Promise.resolve())
      expect(runs).toBe(1)
    })
  )

  it.effect('a failed run does not suppress the next run', () =>
    Effect.gen(function* () {
      let runJob: (() => Promise<void>) | undefined
      let runs = 0
      const scheduler = new SchedulerProvider({
        cron: (_pattern, handler) => {
          runJob = handler
          return { stop: () => undefined }
        },
        runPromise: (effect) => runTest(effect),
      })
      scheduler.register({
        handler: Effect.suspend(() => {
          runs++
          return runs === 1 ? Effect.fail(new Error('failed')) : Effect.void
        }),
        name: 'job',
        pattern: '* * * * *',
      })
      yield* Effect.promise(() => runJob?.() ?? Promise.resolve())
      yield* Effect.promise(() => runJob?.() ?? Promise.resolve())
      expect(runs).toBe(2)
    })
  )

  it.effect('stops every cron handle and guards callbacks when native stop fails', () =>
    Effect.gen(function* () {
      let stops = 0
      let runs = 0
      const callbacks: (() => Promise<void>)[] = []
      const scheduler = new SchedulerProvider({
        cron: (_pattern, handler) => {
          callbacks.push(handler)
          return {
            stop: () => {
              stops++
              if (stops === 1) {
                throw new Error('stop failed')
              }
            },
          }
        },
        runPromise: (effect) => runTest(effect),
      })
      scheduler.register({ handler: Effect.sync(() => runs++), name: 'one', pattern: '* * * * *' })
      scheduler.register({ handler: Effect.sync(() => runs++), name: 'two', pattern: '* * * * *' })
      scheduler.stopAll()
      yield* Effect.promise(() => Promise.all(callbacks.map((callback) => callback())))
      expect(stops).toBe(2)
      expect(runs).toBe(0)
    })
  )
})
