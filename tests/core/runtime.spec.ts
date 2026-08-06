import { describe, expect, test } from 'bun:test'

import { Effect, Fiber } from 'effect'
import { adjust, layer } from 'effect/testing/TestClock'

import { shutdownRuntime } from '@/core/bootstrap'

describe('runtime shutdown', () => {
  test('stops intake before awaiting cooperative work', async () => {
    const events: string[] = []
    await Effect.runPromise(
      shutdownRuntime({
        callbacks: { awaitEmpty: Effect.sync(() => events.push('callbacks-empty')), clear: Effect.void },
        http: {
          stop: async (force) => {
            events.push(force ? 'http-force' : 'http-stop')
          },
        },
        producers: [
          {
            awaitEmpty: Effect.sync(() => events.push('producer-empty')),
            clear: Effect.sync(() => events.push('producer-clear')),
            stopIntake: Effect.sync(() => events.push('producer-stop')),
          },
        ],
        scheduler: { stopAll: () => events.push('scheduler-stop') },
        stopTelegram: Effect.sync(() => events.push('telegram-stop')),
        transcodeQueue: {
          awaitIdle: Effect.sync(() => events.push('queue-idle')),
          stopIntake: Effect.sync(() => events.push('queue-stop')),
        },
      })
    )
    expect(events[0]).toBe('scheduler-stop')
    expect(events).toContain('http-stop')
    expect(events).toContain('callbacks-empty')
    expect(events.indexOf('producer-stop')).toBeLessThan(events.indexOf('producer-empty'))
    expect(events).not.toContain('http-force')
  })

  test('force-closes when graceful HTTP stop fails', async () => {
    const stops: boolean[] = []
    await Effect.runPromise(
      shutdownRuntime({
        callbacks: { awaitEmpty: Effect.void, clear: Effect.void },
        http: {
          stop: async (force) => {
            stops.push(Boolean(force))
            if (!force) {
              throw new Error('graceful stop failed')
            }
          },
        },
        producers: [],
        scheduler: { stopAll: () => undefined },
        stopTelegram: Effect.void,
        transcodeQueue: { awaitIdle: Effect.void, stopIntake: Effect.void },
      })
    )
    expect(stops).toEqual([false, true])
  })

  test('force-closes HTTP before clearing tracked fibers at 30 seconds even when force-close fails', async () => {
    const events: string[] = []
    const effect = shutdownRuntime({
      callbacks: { awaitEmpty: Effect.never, clear: Effect.sync(() => events.push('callbacks-clear')) },
      http: {
        stop: async (force) => {
          events.push(force ? 'http-force' : 'http-stop')
          if (force) {
            throw new Error('force close failed')
          }
          await new Promise(() => undefined)
        },
      },
      producers: [
        {
          awaitEmpty: Effect.never,
          clear: Effect.sync(() => events.push('producer-clear')),
          stopIntake: Effect.sync(() => events.push('producer-stop')),
        },
      ],
      scheduler: { stopAll: () => events.push('scheduler-stop') },
      stopTelegram: Effect.sync(() => events.push('telegram-stop')),
      transcodeQueue: { awaitIdle: Effect.never, stopIntake: Effect.sync(() => events.push('queue-stop')) },
    })

    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(effect)
        yield* Effect.yieldNow
        yield* adjust(30_000)
        yield* Fiber.join(fiber)
      }).pipe(Effect.provide(layer()))
    )
    expect(events.indexOf('http-force')).toBeLessThan(events.indexOf('callbacks-clear'))
    expect(events).toContain('producer-clear')
  })
})
