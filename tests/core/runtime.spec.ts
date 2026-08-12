import { describe, expect, it } from '@tests/it'
import { Effect, Fiber } from 'effect'
import { adjust } from 'effect/testing/TestClock'

import { shutdownRuntime } from '@/core/bootstrap'

describe('runtime shutdown', () => {
  it.effect('stops intake before awaiting cooperative work', () =>
    Effect.gen(function* () {
      const events: string[] = []
      yield* shutdownRuntime({
        callbacks: { awaitEmpty: Effect.sync(() => events.push('callbacks-empty')), clear: Effect.void },
        http: { stop: Effect.sync(() => events.push('http-stop')) },
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
      expect(events[0]).toBe('scheduler-stop')
      expect(events).toContain('http-stop')
      expect(events).toContain('callbacks-empty')
      expect(events.indexOf('producer-stop')).toBeLessThan(events.indexOf('producer-empty'))
    })
  )

  it.effect('contains HTTP shutdown defects', () =>
    shutdownRuntime({
      callbacks: { awaitEmpty: Effect.void, clear: Effect.void },
      http: { stop: Effect.die(new Error('stop failed')) },
      producers: [],
      scheduler: { stopAll: () => undefined },
      stopTelegram: Effect.void,
      transcodeQueue: { awaitIdle: Effect.void, stopIntake: Effect.void },
    })
  )

  it.effect('clears tracked fibers after 30 seconds', () =>
    Effect.gen(function* () {
      const events: string[] = []
      const fiber = yield* Effect.forkChild(
        shutdownRuntime({
          callbacks: { awaitEmpty: Effect.never, clear: Effect.sync(() => events.push('callbacks-clear')) },
          http: { stop: Effect.sync(() => events.push('http-stop')) },
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
      )
      yield* Effect.yieldNow
      yield* adjust(30_000)
      yield* Fiber.join(fiber)
      expect(events.indexOf('http-stop')).toBeLessThan(events.indexOf('callbacks-clear'))
      expect(events).toContain('producer-clear')
    })
  )
})
