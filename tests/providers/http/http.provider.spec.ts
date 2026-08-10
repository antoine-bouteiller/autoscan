import { describe, expect, test } from 'bun:test'

import { makeTestContext, runTest, TestLoggerLive } from '@tests/effect'
import { Cause, Effect, Logger, Schema } from 'effect'
import { HttpServer } from 'effect/unstable/http'

import { HttpProvider, type InjectOptions } from '@/providers/http/http.provider'

const makeProvider = (port?: number) => new HttpProvider({ port })
const inject = (provider: HttpProvider, options: InjectOptions, loggers: ReadonlySet<Logger.Logger<unknown, unknown>> = new Set()) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const context = yield* makeTestContext({}, loggers)
      return yield* Effect.tryPromise(() => provider.inject(options, context))
    }).pipe(Effect.scoped, Effect.provide(TestLoggerLive))
  )

describe('HttpProvider', () => {
  test('preserves exact route matching', async () => {
    const provider = makeProvider()
    provider.get('/exact', (_request, reply) => Effect.sync(() => reply.send({ success: true })))

    const [exact, caseMismatch, trailingSlash] = await Promise.all([
      inject(provider, { method: 'GET', url: '/exact' }),
      inject(provider, { method: 'GET', url: '/EXACT' }),
      inject(provider, { method: 'GET', url: '/exact/' }),
    ])

    expect(exact.statusCode).toBe(200)
    expect(caseMismatch.statusCode).toBe(404)
    expect(trailingSlash.statusCode).toBe(404)
  })

  test('returns the existing bad request response for malformed JSON', async () => {
    const provider = makeProvider()
    provider.post('/body', Schema.Struct({ text: Schema.String }), (_request, reply) => Effect.sync(() => reply.send({ success: true })))

    const response = await inject(provider, { body: '{', method: 'POST', url: '/body' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON' }, success: false })
  })
  test('maps typed failures and defects to one stable response and one Cause-aware log', async () => {
    const causes: Cause.Cause<unknown>[] = []
    const logger = Logger.make<unknown, void>((options) => {
      if (options.cause.reasons.length > 0) {
        causes.push(options.cause)
      }
    })
    const provider = makeProvider()
    provider.get('/typed', () => Effect.fail('typed failure'))
    provider.get('/defect', () => Effect.die('defect'))

    const [typed, defect] = await Promise.all([
      inject(provider, { method: 'GET', url: '/typed' }, new Set([logger])),
      inject(provider, { method: 'GET', url: '/defect' }, new Set([logger])),
    ])

    for (const response of [typed, defect]) {
      expect(response.statusCode).toBe(500)
      expect(response.json().error?.code).toBe('INTERNAL_ERROR')
    }
    expect(causes).toHaveLength(2)
    expect(causes.some((cause) => cause.reasons.some(Cause.isFailReason))).toBeTrue()
    expect(causes.some((cause) => cause.reasons.some(Cause.isDieReason))).toBeTrue()
  })

  test('propagates request interruption and runs route cleanup without returning a 500', async () => {
    const provider = makeProvider()
    let finalized = false
    const { promise: started, resolve: markStarted } = Promise.withResolvers<void>()
    provider.get('/slow', () => Effect.sync(markStarted).pipe(Effect.andThen(Effect.never), Effect.ensuring(Effect.sync(() => (finalized = true)))))
    const controller = new AbortController()

    const response = inject(provider, { method: 'GET', signal: controller.signal, url: '/slow' })
    await started
    controller.abort()
    const rejection = await response.then(
      () => undefined,
      (error: unknown) => error
    )
    expect(rejection).toBeDefined()
    expect(finalized).toBeTrue()
  })

  test('starts and stops the scoped Bun server', async () => {
    const provider = makeProvider(0)

    await runTest(
      Effect.gen(function* () {
        yield* provider.start
        yield* provider.stop
        yield* provider.stop
      })
    )
  })

  test('closes partially acquired server state exactly once after startup failure', async () => {
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

    const exit = await runTest(Effect.exit(provider.start))
    await runTest(provider.stop)
    await runTest(provider.stop)

    expect(exit._tag).toBe('Failure')
    expect(closes).toBe(1)
  })
})
