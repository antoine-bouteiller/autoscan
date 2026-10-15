import { DateTime, Effect } from 'effect'

import { DatabaseQueryError } from '@/config/db'
import { Database } from '@/core/runtime.service'
import { type PlexToken } from '@/database/schema'

const query = <Result>(run: () => Promise<Result>) => Effect.tryPromise({ catch: (cause) => DatabaseQueryError.make({ cause }), try: run })

export const getPlexToken = Database.use(({ sql }) =>
  query(
    () => sql<PlexToken[]>`
      SELECT id, auth_token AS "authToken", client_identifier AS "clientIdentifier", linked_at AS "linkedAt"
      FROM plex_tokens
      LIMIT 1
    `
  ).pipe(Effect.map((rows) => rows[0]))
)

export const upsertPlexToken = (authToken: string, clientIdentifier: string) =>
  Database.use(({ sql }) =>
    Effect.gen(function* () {
      const linkedAt = yield* DateTime.nowAsDate
      const existing = yield* getPlexToken
      yield* query(() =>
        existing === undefined
          ? sql`INSERT INTO plex_tokens (auth_token, client_identifier, linked_at) VALUES (${authToken}, ${clientIdentifier}, ${linkedAt})`
          : sql`
              UPDATE plex_tokens SET auth_token = ${authToken}, client_identifier = ${clientIdentifier}, linked_at = ${linkedAt}
              WHERE id = ${existing.id}
            `
      )
    })
  )
