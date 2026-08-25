import { httpStub } from '@tests/http_client_stub'
import { describe, expect, it } from '@tests/it'
import { Effect } from 'effect'
import { type HttpClient } from 'effect/unstable/http'

import { ArrClient } from '@/integrations/arr/arr.service'

const makeItem = (id: number) => ({ id, status: 'downloading', title: `Item ${id}` })
const makeClient = (transport: HttpClient.HttpClient) =>
  new ArrClient({ apiKey: 'secret', baseUrl: 'https://arr.test/api/v3', serviceName: 'Arr', transport })

const respondWith = (...responses: (() => Response)[]) => {
  let call = 0
  return () => {
    const response = responses[Math.min(call++, responses.length - 1)]
    return Effect.succeed(response === undefined ? new Response() : response())
  }
}

describe('ArrClient queue pagination', () => {
  it.effect('requests one authenticated page when it contains the full queue', () =>
    Effect.gen(function* () {
      const stub = httpStub(respondWith(() => Response.json({ records: [makeItem(1)], totalRecords: 1 })))

      const queue = yield* makeClient(stub.client).getQueue

      expect(queue.records.map(({ id }) => id)).toEqual([1])
      expect(stub.calls).toHaveLength(1)
      expect(stub.calls[0]?.url.href).toBe('https://arr.test/api/v3/queue?page=1&pageSize=100')
      expect(stub.calls[0]?.request.headers['x-api-key']).toBe('secret')
    })
  )

  it.effect('aggregates every queue page in order', () =>
    Effect.gen(function* () {
      const stub = httpStub(
        respondWith(
          () => Response.json({ records: Array.from({ length: 100 }, (_item, index) => makeItem(index + 1)), totalRecords: 101 }),
          () => Response.json({ records: [makeItem(101)], totalRecords: 101 })
        )
      )

      const queue = yield* makeClient(stub.client).getQueue

      expect(queue.records).toHaveLength(101)
      expect(queue.records.at(-1)?.id).toBe(101)
      expect(stub.calls.map(({ url }) => url.searchParams.get('page'))).toEqual(['1', '2'])
    })
  )

  it.effect('stops on an empty page when the reported total is inconsistent', () =>
    Effect.gen(function* () {
      const stub = httpStub(
        respondWith(
          () => Response.json({ records: [makeItem(1)], totalRecords: 200 }),
          () => Response.json({ records: [], totalRecords: 200 })
        )
      )

      const queue = yield* makeClient(stub.client).getQueue

      expect(queue).toEqual({ records: [makeItem(1)], totalRecords: 200 })
      expect(stub.calls).toHaveLength(2)
    })
  )

  it.effect('fails rather than returning partial data when a later page fails', () =>
    Effect.gen(function* () {
      const stub = httpStub(
        respondWith(
          () => Response.json({ records: [makeItem(1)], totalRecords: 2 }),
          () => new Response('failed', { status: 400 })
        )
      )

      const exit = yield* Effect.exit(makeClient(stub.client).getQueue)

      expect(exit._tag).toBe('Failure')
      expect(stub.calls).toHaveLength(2)
    })
  )
})
