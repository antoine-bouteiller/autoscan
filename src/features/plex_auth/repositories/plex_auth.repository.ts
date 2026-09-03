import { eq } from 'drizzle-orm'
import { DateTime, Effect } from 'effect'

import { DatabaseQueryError } from '@/config/db'
import { Database } from '@/core/runtime.service'
import { plexTokens } from '@/database/schema'

const query = <Result>(run: () => Promise<Result>) => Effect.tryPromise({ catch: (cause) => new DatabaseQueryError(cause), try: run })

export const getPlexToken = Database.use(({ db }) => query(() => db.select().from(plexTokens).limit(1)).pipe(Effect.map((rows) => rows[0])))

export const upsertPlexToken = (authToken: string, clientIdentifier: string) =>
  Database.use(({ db }) =>
    Effect.gen(function* () {
      const linkedAt = yield* DateTime.nowAsDate
      const [existing] = yield* query(() => db.select().from(plexTokens).limit(1))
      yield* query(() =>
        existing === undefined
          ? db.insert(plexTokens).values({ authToken, clientIdentifier, linkedAt })
          : db.update(plexTokens).set({ authToken, clientIdentifier, linkedAt }).where(eq(plexTokens.id, existing.id))
      )
    })
  )
