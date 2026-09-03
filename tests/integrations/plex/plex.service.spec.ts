import { DatabaseTestLayer } from '@tests/database'
import { httpStub } from '@tests/http_client_stub'
import { describe, expect, it } from '@tests/it'
import { Effect, Ref } from 'effect'
import { type HttpClient } from 'effect/unstable/http'

import { PlexUnauthenticatedError } from '@/integrations/plex/plex.errors'
import { PlexClient } from '@/integrations/plex/plex.service'

const makeClient = (transport: HttpClient.HttpClient, invalidate: Effect.Effect<void> = Effect.void) =>
  new PlexClient({ invalidate, token: Effect.succeed('stored-token'), transport, url: 'https://plex.test' })

const respondWith = (response: () => Response) => () => Effect.succeed(response())

describe('PlexClient media calls', () => {
  it.effect('authorizes every request with the resolved token', () =>
    Effect.gen(function* () {
      const stub = httpStub(respondWith(() => Response.json({ MediaContainer: { Directory: [{ key: 1, title: 'Movies', type: 'movie' }] } })))

      const sections = yield* makeClient(stub.client).getSections.pipe(Effect.provide(DatabaseTestLayer))

      expect(sections).toEqual([{ key: 1, title: 'Movies', type: 'movie' }])
      expect(stub.calls[0]?.request.headers['x-plex-token']).toBe('stored-token')
    })
  )

  it.effect('invalidates the cached token and reports an unauthenticated state on 401', () =>
    Effect.gen(function* () {
      const invalidated = yield* Ref.make(false)
      const stub = httpStub(respondWith(() => new Response('denied', { status: 401 })))

      const error = yield* makeClient(stub.client, Ref.set(invalidated, true)).getSections.pipe(Effect.provide(DatabaseTestLayer), Effect.flip)

      expect(error).toBeInstanceOf(PlexUnauthenticatedError)
      expect(yield* Ref.get(invalidated)).toBeTrue()
    })
  )
})

describe('PlexClient link flow', () => {
  it.effect('creates a strong pin bound to the attempt identifier', () =>
    Effect.gen(function* () {
      const stub = httpStub(respondWith(() => Response.json({ code: 'PIN1', expiresIn: 900, id: 42 })))

      const pin = yield* makeClient(stub.client).createPin('client-id')

      expect(pin).toEqual({ code: 'PIN1', expiresIn: 900, id: 42 })
      expect(stub.calls[0]?.url.href).toBe('https://plex.tv/api/v2/pins?strong=true')
      expect(stub.calls[0]?.request.headers['x-plex-client-identifier']).toBe('client-id')
      expect(stub.calls[0]?.request.headers['x-plex-token']).toBeUndefined()
    })
  )

  it.effect('reports no token while the pin is unclaimed', () =>
    Effect.gen(function* () {
      const unclaimed = '{"authToken":null,"code":"PIN1","expiresIn":900,"id":42}'
      const stub = httpStub(respondWith(() => new Response(unclaimed, { headers: { 'content-type': 'application/json' } })))

      expect(yield* makeClient(stub.client).checkPin(42, 'client-id')).toBeUndefined()
      expect(stub.calls[0]?.url.href).toBe('https://plex.tv/api/v2/pins/42')
    })
  )

  it.effect('returns the token once the pin is claimed', () =>
    Effect.gen(function* () {
      const stub = httpStub(respondWith(() => Response.json({ authToken: 'granted', code: 'PIN1', expiresIn: 900, id: 42 })))

      expect(yield* makeClient(stub.client).checkPin(42, 'client-id')).toBe('granted')
    })
  )

  it.effect('answers whether plex.tv still accepts a token', () =>
    Effect.gen(function* () {
      const accepted = httpStub(respondWith(() => Response.json({ id: 1 })))
      const rejected = httpStub(respondWith(() => new Response('denied', { status: 401 })))

      expect(yield* makeClient(accepted.client).verifyToken('stored-token', 'client-id')).toBeTrue()
      expect(yield* makeClient(rejected.client).verifyToken('stored-token', 'client-id')).toBeFalse()
      expect(accepted.calls[0]?.request.headers['x-plex-token']).toBe('stored-token')
    })
  )
})
