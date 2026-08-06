import { describe, expect, test } from 'bun:test'

import { runTest } from '@tests/effect'
import { Effect, Schema } from 'effect'

import { HttpProvider } from '@/providers/http/http.provider'

const runPromise: ConstructorParameters<typeof HttpProvider>[0]['runPromise'] = (effect) => runTest(effect)
const makeProvider = (port?: number) => new HttpProvider({ port, runPromise })

describe('HttpProvider', () => {
  test('preserves exact route matching', async () => {
    const provider = makeProvider()
    provider.get('/exact', (_request, reply) => Effect.sync(() => reply.send({ success: true })))

    const [exact, caseMismatch, trailingSlash] = await Promise.all([
      provider.inject({ method: 'GET', url: '/exact' }),
      provider.inject({ method: 'GET', url: '/EXACT' }),
      provider.inject({ method: 'GET', url: '/exact/' }),
    ])

    expect(exact.statusCode).toBe(200)
    expect(caseMismatch.statusCode).toBe(404)
    expect(trailingSlash.statusCode).toBe(404)
  })

  test('returns the existing bad request response for malformed JSON', async () => {
    const provider = makeProvider()
    provider.post('/body', Schema.Struct({ text: Schema.String }), (_request, reply) => Effect.sync(() => reply.send({ success: true })))

    const response = await provider.inject({ body: '{', method: 'POST', url: '/body' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON' }, success: false })
  })

  test('starts and stops the scoped Bun server', async () => {
    const provider = makeProvider(0)

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* provider.start
        yield* provider.stop
        yield* provider.stop
      })
    )
  })
})
