import { beforeEach } from 'bun:test'

import { testDatabase as db, DatabaseTestLayer } from '@tests/database'
import { describe, expect, it } from '@tests/it'
import { Effect, Layer } from 'effect'

import { type Database } from '@/core/runtime.service'
import { plexTokens } from '@/database/schema'
import { PlexTokenStore, PlexTokenStoreLive } from '@/features/plex_auth/services/plex_token.service'
import { PlexUnauthenticatedError } from '@/integrations/plex/plex.errors'

const run = <Success, Failure>(effect: Effect.Effect<Success, Failure, Database | PlexTokenStore>) =>
  effect.pipe(Effect.provide(Layer.mergeAll(PlexTokenStoreLive, DatabaseTestLayer)))

describe('PlexTokenStore', () => {
  beforeEach(() => db.delete(plexTokens))

  it.live('fails as unauthenticated while no token is stored', () =>
    Effect.gen(function* () {
      const error = yield* run(
        Effect.gen(function* () {
          const store = yield* PlexTokenStore
          return yield* store.get
        })
      ).pipe(Effect.flip)
      expect(error).toBeInstanceOf(PlexUnauthenticatedError)
    })
  )

  it.live('persists a linked token and serves it from the cache until invalidated', () =>
    Effect.gen(function* () {
      const served = yield* run(
        Effect.gen(function* () {
          const store = yield* PlexTokenStore
          yield* store.set('first', 'client-id')
          const cached = yield* store.get
          yield* Effect.promise(() => db.update(plexTokens).set({ authToken: 'rotated' }))
          const stillCached = yield* store.get
          yield* store.invalidate
          return { cached, reloaded: yield* store.get, stillCached }
        })
      )

      expect(served).toEqual({ cached: 'first', reloaded: 'rotated', stillCached: 'first' })
    })
  )

  it.live('keeps a single credential row across re-links', () =>
    Effect.gen(function* () {
      yield* run(
        Effect.gen(function* () {
          const store = yield* PlexTokenStore
          yield* store.set('first', 'first-id')
          yield* store.set('second', 'second-id')
        })
      )

      const rows = yield* Effect.promise(() => db.select().from(plexTokens))
      expect(rows).toHaveLength(1)
      expect(rows[0]?.authToken).toBe('second')
      expect(rows[0]?.clientIdentifier).toBe('second-id')
    })
  )
})
