import * as v from 'valibot'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { HttpError } from '@/errors/http'
import { NetworkError } from '@/errors/network'
import { ValidationError } from '@/errors/validation'
import { httpClient } from '@/utils/http_client'

import { isError } from '../../src/utils/error'

const originalFetch = globalThis.fetch

describe('httpClient', () => {
  const mockFetch = vi.fn<typeof fetch>()

  beforeEach(() => {
    mockFetch.mockReset()
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    globalThis.fetch = mockFetch as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const client = httpClient({ baseUrl: 'http://api.test', serviceName: 'Test' })

  describe('get', () => {
    test('should return undefined when no validator is provided', async () => {
      mockFetch.mockResolvedValue(new Response(undefined, { status: 200 }))

      const result = await client.get('/items')

      expect(result).toBeUndefined()
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should validate response with validator', async () => {
      const validator = v.object({ id: v.number(), name: v.string() })
      mockFetch.mockResolvedValue(Response.json({ id: 1, name: 'test' }, { status: 200 }))

      const result = await client.get('/items/1', { validator })

      expect(isError(result)).toBe(false)
      if (!isError(result)) {
        expect(result).toEqual({ id: 1, name: 'test' })
      }
    })

    test('should return ValidationError when response does not match validator', async () => {
      const validator = v.object({ id: v.number(), name: v.string() })

      mockFetch.mockResolvedValue(Response.json({ id: 'not-a-number' }, { status: 200 }))

      const result = await client.get('/items/1', { validator })

      expect(isError(result)).toBe(true)
      expect(result).toBeInstanceOf(ValidationError)
    })

    test('should append query params', async () => {
      mockFetch.mockResolvedValue(new Response(undefined, { status: 200 }))

      await client.get('/items', { params: { page: 1, limit: 10 } })

      const calledUrl = mockFetch.mock.calls[0]?.[0]
      expect(calledUrl).toBeInstanceOf(URL)
      const urlString = calledUrl instanceof URL ? calledUrl.href : ''
      expect(urlString).toContain('page=1')
      expect(urlString).toContain('limit=10')
    })
  })

  describe('post', () => {
    test('should send body as JSON', async () => {
      mockFetch.mockResolvedValue(new Response(undefined, { status: 201 }))

      await client.post('/items', { body: { name: 'new-item' } })

      const calledOptions = mockFetch.mock.calls[0]?.[1]
      expect(calledOptions?.body).toBe(JSON.stringify({ name: 'new-item' }))
      expect(calledOptions?.method).toBe('POST')
    })
  })

  describe('error handling', () => {
    test('should return HttpError for non-ok responses', async () => {
      mockFetch.mockResolvedValue(Response.json({ error: 'not found' }, { status: 404 }))

      const result = await client.get('/missing')

      expect(result).toBeInstanceOf(HttpError)
      if (result instanceof HttpError) {
        expect(result.status).toBe(404)
      }
    })

    test('should return NetworkError when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await client.get('/items')

      expect(result).toBeInstanceOf(NetworkError)
      if (result instanceof NetworkError) {
        expect(result.originalMessage).toBe('ECONNREFUSED')
      }
    })

    test('should handle non-Error fetch throws', async () => {
      mockFetch.mockRejectedValue('unknown')

      const result = await client.get('/items')

      expect(result).toBeInstanceOf(NetworkError)
      if (result instanceof NetworkError) {
        expect(result.originalMessage).toBe('Unknown network error')
      }
    })

    test('should use custom error formatter', async () => {
      const customClient = httpClient({
        baseUrl: 'http://api.test',
        serviceName: 'Test',
        errorFormatter: (body: unknown) => `custom: ${JSON.stringify(body)}`,
      })
      mockFetch.mockResolvedValue(Response.json({ msg: 'bad' }, { status: 400 }))

      const result = await customClient.get('/items')

      expect(result).toBeInstanceOf(HttpError)
      if (result instanceof HttpError) {
        expect(result.message).toContain('custom:')
      }
    })
  })

  describe('headers', () => {
    test('should merge global and per-request headers', async () => {
      const authedClient = httpClient({
        baseUrl: 'http://api.test',
        serviceName: 'Test',
        headers: { Authorization: 'Bearer token' },
      })
      mockFetch.mockResolvedValue(new Response(undefined, { status: 200 }))

      await authedClient.get('/items', { headers: { 'X-Custom': 'value' } })

      const calledOptions = mockFetch.mock.calls[0]?.[1]
      const headers = calledOptions?.headers
      expect(headers).toBeDefined()
      expect(headers).toMatchObject({ Authorization: 'Bearer token', 'X-Custom': 'value' })
    })
  })

  describe('URL construction', () => {
    test('should handle trailing slashes in baseUrl', async () => {
      const slashClient = httpClient({ baseUrl: 'http://api.test/', serviceName: 'Test' })
      mockFetch.mockResolvedValue(new Response(undefined, { status: 200 }))

      await slashClient.get('/items')

      const calledUrl = mockFetch.mock.calls[0]?.[0]
      expect(calledUrl).toBeInstanceOf(URL)
      expect(calledUrl instanceof URL ? calledUrl.href : '').toBe('http://api.test/items')
    })
  })

  describe('methods', () => {
    test('should support delete', async () => {
      mockFetch.mockResolvedValue(new Response(undefined, { status: 204 }))

      await client.delete('/items/1')

      expect(mockFetch.mock.calls[0]?.[1]?.method).toBe('DELETE')
    })

    test('should support put', async () => {
      mockFetch.mockResolvedValue(new Response(undefined, { status: 200 }))

      await client.put('/items/1', { body: { name: 'updated' } })

      expect(mockFetch.mock.calls[0]?.[1]?.method).toBe('PUT')
    })

    test('should support patch', async () => {
      mockFetch.mockResolvedValue(new Response(undefined, { status: 200 }))

      await client.patch('/items/1', { body: { name: 'patched' } })

      expect(mockFetch.mock.calls[0]?.[1]?.method).toBe('PATCH')
    })
  })
})
