import { spyOn } from 'bun:test'

import { describe, expect, it } from '@tests/it'
import { Effect, Fiber, Result, Schema } from 'effect'
import { adjust } from 'effect/testing/TestClock'

import { HttpError } from '@/shared/errors/http'
import { NetworkError } from '@/shared/errors/network'
import { ValidationError } from '@/shared/errors/validation'
import { httpClient } from '@/shared/utils/http_client'

const schema = Schema.Struct({ value: Schema.String })
const client = () => httpClient({ baseUrl: 'https://example.com/', headers: { Authorization: 'token' }, serviceName: 'Test' })

describe('httpClient', () => {
  it.effect('validates successful responses', () =>
    Effect.gen(function* () {
      spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ value: 'ok' }))
      expect(yield* client().get('/resource', { validator: schema })).toEqual({ value: 'ok' })
    })
  )

  it.effect('supports responses without bodies', () =>
    Effect.gen(function* () {
      spyOn(globalThis, 'fetch').mockResolvedValue(new Response(undefined, { status: 204 }))
      expect(yield* client().delete('/resource')).toBeUndefined()
    })
  )

  it.effect('reports all validation failures', () =>
    Effect.gen(function* () {
      spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ wrong: true }))
      const validator = Schema.Struct({ count: Schema.Finite, value: Schema.String })
      const result = yield* Effect.result(client().get('/resource', { validator }))
      expect(Result.isFailure(result) && result.failure).toBeInstanceOf(ValidationError)
      if (Result.isFailure(result) && result.failure instanceof ValidationError) {
        const details = JSON.parse(result.failure.details)
        expect(details.issues.map((issue: { path: string[] }) => issue.path)).toEqual([['count'], ['value']])
      }
    })
  )

  it.effect('reports HTTP failures', () =>
    Effect.gen(function* () {
      spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ message: 'bad' }, { status: 400 }))
      const result = yield* Effect.result(client().post('/resource'))
      expect(Result.isFailure(result) && result.failure).toBeInstanceOf(HttpError)
    })
  )

  it.effect('reports network failures without retrying mutations', () =>
    Effect.gen(function* () {
      const fetchMock = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
      const result = yield* Effect.result(client().post('/resource'))
      expect(Result.isFailure(result) && result.failure).toBeInstanceOf(NetworkError)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  )

  it.live('retries GET server failures at most twice', () =>
    Effect.gen(function* () {
      const fetchMock = spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(Response.json({}, { status: 500 }))
        .mockResolvedValueOnce(Response.json({}, { status: 500 }))
        .mockResolvedValueOnce(Response.json({ value: 'ok' }))
      expect(yield* client().get('/resource', { validator: schema })).toEqual({ value: 'ok' })
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })
  )

  it.effect('builds query parameters and merges headers', () =>
    Effect.gen(function* () {
      const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ value: 'ok' }))
      yield* client().get('/resource', { headers: { Custom: 'yes' }, params: { page: 2 }, validator: schema })
      const [url, options] = fetchMock.mock.calls[0] ?? []
      expect(url instanceof Request ? url.url : url?.toString()).toBe('https://example.com/resource?page=2')
      expect(options?.headers).toEqual({ Authorization: 'token', Custom: 'yes' })
    })
  )

  it.effect('honors Retry-After without jitter', () =>
    Effect.gen(function* () {
      const fetchMock = spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(Response.json({}, { headers: { 'Retry-After': '10' }, status: 429 }))
        .mockResolvedValueOnce(Response.json({ value: 'ok' }))

      const fiber = yield* Effect.forkChild(client().get('/resource', { validator: schema }))
      yield* Effect.yieldNow
      expect(fetchMock).toHaveBeenCalledTimes(1)
      yield* adjust(9999)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      yield* adjust(1)
      expect(yield* Fiber.join(fiber)).toEqual({ value: 'ok' })
    })
  )

  it.effect('allows retries to be disabled for GET mutations', () =>
    Effect.gen(function* () {
      const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}, { status: 500 }))
      yield* Effect.result(client().get('/resource', { retry: false }))
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  )

  it.effect('passes an interruption signal to fetch', () =>
    Effect.gen(function* () {
      const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ value: 'ok' }))
      yield* client().get('/resource', { validator: schema })
      expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
    })
  )
})
