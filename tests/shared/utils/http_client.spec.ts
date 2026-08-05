import { describe, expect, spyOn, test } from 'bun:test'

import { Effect, Fiber, Result } from 'effect'
import { adjust, layer } from 'effect/testing/TestClock'
import { z } from 'zod'

import { HttpError } from '@/shared/errors/http'
import { NetworkError } from '@/shared/errors/network'
import { ValidationError } from '@/shared/errors/validation'
import { httpClient } from '@/shared/utils/http_client'

const schema = z.object({ value: z.string() })
const client = () => httpClient({ baseUrl: 'https://example.com/', headers: { Authorization: 'token' }, serviceName: 'Test' })

describe('httpClient', () => {
  test('validates successful responses', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ value: 'ok' }))
    expect(await Effect.runPromise(client().get('/resource', { validator: schema }))).toEqual({ value: 'ok' })
  })

  test('supports responses without bodies', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValue(new Response(undefined, { status: 204 }))
    expect(await Effect.runPromise(client().delete('/resource'))).toBeUndefined()
  })

  test('reports validation failures', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ wrong: true }))
    const result = await Effect.runPromise(Effect.result(client().get('/resource', { validator: schema })))
    expect(Result.isFailure(result) && result.failure).toBeInstanceOf(ValidationError)
  })

  test('reports HTTP failures', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ message: 'bad' }, { status: 400 }))
    const result = await Effect.runPromise(Effect.result(client().post('/resource')))
    expect(Result.isFailure(result) && result.failure).toBeInstanceOf(HttpError)
  })

  test('reports network failures without retrying mutations', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    const result = await Effect.runPromise(Effect.result(client().post('/resource')))
    expect(Result.isFailure(result) && result.failure).toBeInstanceOf(NetworkError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('retries GET server failures at most twice', async () => {
    const fetchMock = spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({}, { status: 500 }))
      .mockResolvedValueOnce(Response.json({}, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ value: 'ok' }))
    expect(await Effect.runPromise(client().get('/resource', { validator: schema }))).toEqual({ value: 'ok' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  test('builds query parameters and merges headers', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ value: 'ok' }))
    await Effect.runPromise(client().get('/resource', { headers: { Custom: 'yes' }, params: { page: 2 }, validator: schema }))
    const [url, options] = fetchMock.mock.calls[0] ?? []
    expect(url instanceof Request ? url.url : url?.toString()).toBe('https://example.com/resource?page=2')
    expect(options?.headers).toEqual({ Authorization: 'token', Custom: 'yes' })
  })

  test('honors Retry-After without jitter', async () => {
    const fetchMock = spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({}, { headers: { 'Retry-After': '10' }, status: 429 }))
      .mockResolvedValueOnce(Response.json({ value: 'ok' }))

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(client().get('/resource', { validator: schema }))
        yield* Effect.yieldNow
        expect(fetchMock).toHaveBeenCalledTimes(1)
        yield* adjust(9999)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        yield* adjust(1)
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(layer()))
    )
    expect(result).toEqual({ value: 'ok' })
  })

  test('allows retries to be disabled for GET mutations', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}, { status: 500 }))
    await Effect.runPromise(Effect.result(client().get('/resource', { retry: false })))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('passes an interruption signal to fetch', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ value: 'ok' }))
    await Effect.runPromise(client().get('/resource', { validator: schema }))
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
  })
})
