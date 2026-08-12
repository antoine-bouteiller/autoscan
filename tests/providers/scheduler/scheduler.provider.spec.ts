import { describe, expect, test } from 'bun:test'

import { runTest } from '@tests/effect'
import { Effect } from 'effect'

import { SchedulerProvider } from '@/providers/scheduler/scheduler.provider'

describe('SchedulerProvider', () => {
  test('runs registered jobs through the tracked runtime', async () => {
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
    await runJob?.()
    expect(runs).toBe(1)
  })

  test('a failed run does not suppress the next run', async () => {
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
    await runJob?.()
    await runJob?.()
    expect(runs).toBe(2)
  })

  test('stops every cron handle and guards callbacks when native stop fails', async () => {
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
    await Promise.all(callbacks.map((callback) => callback()))
    expect(stops).toBe(2)
    expect(runs).toBe(0)
  })
})
