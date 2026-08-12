import { spyOn } from 'bun:test'

import { describe, expect, it } from '@tests/it'
import { Effect } from 'effect'

import { ArrClient } from '@/integrations/arr/arr.service'

const makeItem = (id: number) => ({ id, status: 'downloading', title: `Item ${id}` })
const makeClient = () => new ArrClient({ apiKey: 'secret', baseUrl: 'https://arr.test/api/v3', serviceName: 'Arr' })
const fetchUrl = (request: unknown): string => {
  if (typeof request === 'string') {
    return request
  }
  if (request instanceof URL) {
    return request.href
  }
  if (request instanceof Request) {
    return request.url
  }
  throw new TypeError('Unexpected fetch input')
}

describe('ArrClient queue pagination', () => {
  it.effect('requests one authenticated page when it contains the full queue', () =>
    Effect.gen(function* () {
      const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ records: [makeItem(1)], totalRecords: 1 }))

      const queue = yield* makeClient().getQueue()

      expect(queue.records.map(({ id }) => id)).toEqual([1])
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [firstCall] = fetchMock.mock.calls
      expect(firstCall).toBeDefined()
      if (firstCall === undefined) {
        throw new Error('fetch was not called')
      }
      const [request, options] = firstCall
      expect(fetchUrl(request)).toBe('https://arr.test/api/v3/queue?page=1&pageSize=100')
      expect(new Headers(options?.headers).get('X-Api-Key')).toBe('secret')
    })
  )

  it.effect('aggregates every queue page in order', () =>
    Effect.gen(function* () {
      const pages = [
        { records: Array.from({ length: 100 }, (_item, index) => makeItem(index + 1)), totalRecords: 101 },
        { records: [makeItem(101)], totalRecords: 101 },
      ]
      const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(pages[0])).mockResolvedValueOnce(Response.json(pages[1]))

      const queue = yield* makeClient().getQueue()

      expect(queue.records).toHaveLength(101)
      expect(queue.records.at(-1)?.id).toBe(101)
      expect(fetchMock.mock.calls.map(([request]) => new URL(fetchUrl(request)).searchParams.get('page'))).toEqual(['1', '2'])
    })
  )

  it.effect('stops on an empty page when the reported total is inconsistent', () =>
    Effect.gen(function* () {
      const pages = [
        { records: [makeItem(1)], totalRecords: 200 },
        { records: [], totalRecords: 200 },
      ]
      const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(pages[0])).mockResolvedValueOnce(Response.json(pages[1]))

      const queue = yield* makeClient().getQueue()

      expect(queue).toEqual({ records: [makeItem(1)], totalRecords: 200 })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  )

  it.effect('fails rather than returning partial data when a later page fails', () =>
    Effect.gen(function* () {
      const fetchMock = spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(Response.json({ records: [makeItem(1)], totalRecords: 2 }))
        .mockResolvedValueOnce(new Response('failed', { status: 400 }))

      const exit = yield* Effect.exit(makeClient().getQueue())

      expect(exit._tag).toBe('Failure')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  )
})
