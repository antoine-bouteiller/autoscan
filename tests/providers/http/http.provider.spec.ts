import { makeTestContext, provideTest, TestLoggerLive } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { TestFailure } from '@tests/utils'
import { Cause, Effect, Fiber, Latch, Logger, Schema } from 'effect'
import { HttpServer } from 'effect/unstable/http'

import { HttpProvider, type InjectOptions } from '@/providers/http/http.provider'

const makeProvider = (port?: number) => new HttpProvider({ port })
const inject = (provider: HttpProvider, options: InjectOptions, loggers: ReadonlySet<Logger.Logger<unknown, unknown>> = new Set()) =>
  Effect.gen(function* () {
    const context = yield* makeTestContext({}, loggers)
    return yield* provider.inject(options, context)
  }).pipe(Effect.scoped, Effect.provide(TestLoggerLive))

describe('HttpProvider', () => {
  it.live('preserves exact route matching', () =>
    Effect.gen(function* () {
      const provider = makeProvider()
      provider.get('/exact', (_request, reply) => Effect.sync(() => reply.send({ success: true })))

      const [exact, caseMismatch, trailingSlash] = yield* Effect.all(
        [
          inject(provider, { method: 'GET', url: '/exact' }),
          inject(provider, { method: 'GET', url: '/EXACT' }),
          inject(provider, { method: 'GET', url: '/exact/' }),
        ],
        { concurrency: 'unbounded' }
      )

      expect(exact.statusCode).toBe(200)
      expect(caseMismatch.statusCode).toBe(404)
      expect(trailingSlash.statusCode).toBe(404)
    })
  )

  it.live('returns the existing bad request response for malformed JSON', () =>
    Effect.gen(function* () {
      const provider = makeProvider()
      provider.post('/body', Schema.Struct({ text: Schema.String }), (_request, reply) => Effect.sync(() => reply.send({ success: true })))

      const response = yield* inject(provider, { body: '{', method: 'POST', url: '/body' })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON' }, success: false })
    })
  )

  it.live('maps typed failures and defects to one stable response and one Cause-aware log', () =>
    Effect.gen(function* () {
      const causes: Cause.Cause<unknown>[] = []
      const logger = Logger.make<unknown, void>((options) => {
        if (options.cause.reasons.length > 0) {
          causes.push(options.cause)
        }
      })
      const provider = makeProvider()
      provider.get('/typed', () => Effect.fail(new TestFailure({ message: 'typed failure' })))
      provider.get('/defect', () => Effect.die('defect'))

      const [typed, defect] = yield* Effect.all(
        [
          inject(provider, { method: 'GET', url: '/typed' }, new Set([logger])),
          inject(provider, { method: 'GET', url: '/defect' }, new Set([logger])),
        ],
        { concurrency: 'unbounded' }
      )

      for (const response of [typed, defect]) {
        expect(response.statusCode).toBe(500)
        expect(response.json().error?.code).toBe('INTERNAL_ERROR')
      }
      expect(causes).toHaveLength(2)
      expect(causes.some((cause) => cause.reasons.some(Cause.isFailReason))).toBeTrue()
      expect(causes.some((cause) => cause.reasons.some(Cause.isDieReason))).toBeTrue()
    })
  )

  it.live('propagates request interruption and runs route cleanup without returning a 500', () =>
    Effect.gen(function* () {
      const provider = makeProvider()
      let finalized = false
      const started = yield* Latch.make()
      provider.get('/slow', () => started.open.pipe(Effect.andThen(Effect.never), Effect.ensuring(Effect.sync(() => (finalized = true)))))

      const fiber = yield* Effect.forkChild(inject(provider, { method: 'GET', url: '/slow' }))
      yield* started.await
      fiber.interruptUnsafe()
      const exit = yield* Fiber.await(fiber)

      expect(exit._tag).toBe('Failure')
      expect(finalized).toBeTrue()
    })
  )

  it.live('starts and stops the scoped Bun server', () =>
    provideTest(
      Effect.gen(function* () {
        const provider = makeProvider(0)
        yield* provider.start
        yield* provider.stop
        yield* provider.stop
      })
    )
  )

  it.live('closes partially acquired server state exactly once after startup failure', () =>
    Effect.gen(function* () {
      let closes = 0
      const server = Effect.acquireRelease(
        Effect.succeed(
          HttpServer.make({
            address: { _tag: 'TcpAddress', hostname: 'test', port: 0 },
            serve: () => Effect.die('serve failed'),
          })
        ),
        () => Effect.sync(() => closes++)
      )
      const provider = new HttpProvider({ server })

      const exit = yield* provideTest(Effect.exit(provider.start))
      yield* provideTest(provider.stop)
      yield* provideTest(provider.stop)

      expect(exit._tag).toBe('Failure')
      expect(closes).toBe(1)
    })
  )
})
