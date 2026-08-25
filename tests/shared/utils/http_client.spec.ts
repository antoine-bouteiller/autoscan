import { httpStub, transportFailure } from '@tests/http_client_stub'
import { describe, expect, it } from '@tests/it'
import { Effect, Fiber, Result, Schema } from 'effect'
import { adjust } from 'effect/testing/TestClock'
import { type HttpClient } from 'effect/unstable/http'

import { HttpError } from '@/shared/errors/http'
import { NetworkError } from '@/shared/errors/network'
import { ValidationError } from '@/shared/errors/validation'
import { httpClient } from '@/shared/utils/http_client'

const schema = Schema.Struct({ value: Schema.String })
const client = (transport: HttpClient.HttpClient) =>
  httpClient({ baseUrl: 'https://example.com/', headers: { Authorization: 'token' }, serviceName: 'Test', transport })

const respondWith = (...responses: (() => Response)[]) => {
  let call = 0
  return () => {
    const response = responses[Math.min(call++, responses.length - 1)]
    return Effect.succeed(response === undefined ? new Response() : response())
  }
}

describe('httpClient', () => {
  it.effect('validates successful responses', () =>
    Effect.gen(function* () {
      const stub = httpStub(respondWith(() => Response.json({ value: 'ok' })))
      expect(yield* client(stub.client).get('/resource', { validator: schema })).toEqual({ value: 'ok' })
    })
  )

  it.effect('supports responses without bodies', () =>
    Effect.gen(function* () {
      const stub = httpStub(respondWith(() => new Response(undefined, { status: 204 })))
      expect(yield* client(stub.client).delete('/resource')).toBeUndefined()
    })
  )

  it.effect('reports all validation failures', () =>
    Effect.gen(function* () {
      const stub = httpStub(respondWith(() => Response.json({ wrong: true })))
      const validator = Schema.Struct({ count: Schema.Finite, value: Schema.String })
      const result = yield* Effect.result(client(stub.client).get('/resource', { validator }))
      expect(Result.isFailure(result) && result.failure).toBeInstanceOf(ValidationError)
      if (Result.isFailure(result) && result.failure instanceof ValidationError) {
        expect(result.failure.details).toContain('count')
        expect(result.failure.details).toContain('value')
      }
    })
  )

  it.effect('reports HTTP failures', () =>
    Effect.gen(function* () {
      const stub = httpStub(respondWith(() => Response.json({ message: 'bad' }, { status: 400 })))
      const result = yield* Effect.result(client(stub.client).post('/resource'))
      expect(Result.isFailure(result) && result.failure).toBeInstanceOf(HttpError)
    })
  )

  it.effect('reports network failures without retrying mutations', () =>
    Effect.gen(function* () {
      const stub = httpStub(transportFailure(new Error('offline')))
      const result = yield* Effect.result(client(stub.client).post('/resource'))
      expect(Result.isFailure(result) && result.failure).toBeInstanceOf(NetworkError)
      expect(stub.calls).toHaveLength(1)
    })
  )

  it.live('retries GET server failures at most twice', () =>
    Effect.gen(function* () {
      const stub = httpStub(
        respondWith(
          () => Response.json({}, { status: 500 }),
          () => Response.json({}, { status: 500 }),
          () => Response.json({ value: 'ok' })
        )
      )
      expect(yield* client(stub.client).get('/resource', { validator: schema })).toEqual({ value: 'ok' })
      expect(stub.calls).toHaveLength(3)
    })
  )

  it.effect('builds query parameters and merges headers', () =>
    Effect.gen(function* () {
      const stub = httpStub(respondWith(() => Response.json({ value: 'ok' })))
      yield* client(stub.client).get('/resource', { headers: { Custom: 'yes' }, params: { page: 2 }, validator: schema })
      const [call] = stub.calls
      expect(call?.url.href).toBe('https://example.com/resource?page=2')
      expect(call?.request.headers).toMatchObject({ authorization: 'token', custom: 'yes' })
    })
  )

  it.effect('honors Retry-After without jitter', () =>
    Effect.gen(function* () {
      const stub = httpStub(
        respondWith(
          () => Response.json({}, { headers: { 'Retry-After': '10' }, status: 429 }),
          () => Response.json({ value: 'ok' })
        )
      )

      const fiber = yield* Effect.forkChild(client(stub.client).get('/resource', { validator: schema }))
      yield* Effect.yieldNow
      expect(stub.calls).toHaveLength(1)
      yield* adjust(9999)
      expect(stub.calls).toHaveLength(1)
      yield* adjust(1)
      expect(yield* Fiber.join(fiber)).toEqual({ value: 'ok' })
    })
  )

  it.effect('allows retries to be disabled for GET mutations', () =>
    Effect.gen(function* () {
      const stub = httpStub(respondWith(() => Response.json({}, { status: 500 })))
      yield* Effect.result(client(stub.client).get('/resource', { retry: false }))
      expect(stub.calls).toHaveLength(1)
    })
  )

  it.effect('passes an interruption signal to the transport', () =>
    Effect.gen(function* () {
      const stub = httpStub(respondWith(() => Response.json({ value: 'ok' })))
      yield* client(stub.client).get('/resource', { validator: schema })
      expect(stub.calls[0]?.signal).toBeInstanceOf(AbortSignal)
    })
  )
})
