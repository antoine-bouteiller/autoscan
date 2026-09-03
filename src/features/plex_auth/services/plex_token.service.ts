import { Context, Effect, Layer, Ref, Semaphore } from 'effect'

import { type DatabaseQueryError } from '@/config/db'
import { type Database } from '@/core/runtime.service'
import { getPlexToken, upsertPlexToken } from '@/features/plex_auth/repositories/plex_auth.repository'
import { PlexUnauthenticatedError } from '@/integrations/plex/plex.errors'

interface PlexTokenStoreService {
  readonly get: Effect.Effect<string, DatabaseQueryError | PlexUnauthenticatedError, Database>
  readonly invalidate: Effect.Effect<void>
  readonly set: (token: string, clientIdentifier: string) => Effect.Effect<void, DatabaseQueryError, Database>
}

export class PlexTokenStore extends Context.Service<PlexTokenStore, PlexTokenStoreService>()(
  'autoscan/features/plex_auth/services/plex_token.service/PlexTokenStore'
) {}

export const PlexTokenStoreLive = Layer.effect(
  PlexTokenStore,
  Effect.gen(function* () {
    const cache = yield* Ref.make<string | undefined>(undefined)
    const loading = yield* Semaphore.make(1)

    const load = loading.withPermits(1)(
      Effect.gen(function* () {
        const cached = yield* Ref.get(cache)
        if (cached !== undefined) {
          return cached
        }
        const row = yield* getPlexToken
        if (row === undefined) {
          return yield* new PlexUnauthenticatedError()
        }
        yield* Ref.set(cache, row.authToken)
        return row.authToken
      })
    )

    return PlexTokenStore.of({
      get: Effect.gen(function* () {
        const cached = yield* Ref.get(cache)
        return cached ?? (yield* load)
      }),
      invalidate: Ref.set(cache, undefined),
      set: (token, clientIdentifier) => upsertPlexToken(token, clientIdentifier).pipe(Effect.flatMap(() => Ref.set(cache, token))),
    })
  })
)
