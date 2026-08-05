import { SQL } from 'bun'
import { drizzle } from 'drizzle-orm/bun-sql'
import { migrate } from 'drizzle-orm/bun-sql/migrator'
import { Data, Effect, Layer } from 'effect'

import env from '@/config/env'
import { Database } from '@/core/runtime.service'

export class DatabaseQueryError extends Data.TaggedError('DatabaseQueryError')<{ readonly cause: unknown; readonly message: string }> {
  constructor(cause: unknown) {
    super({ cause, message: 'Database query failed' })
  }
}

class DatabaseConnectionError extends Data.TaggedError('DatabaseConnectionError')<{
  readonly cause: unknown
  readonly message: string
}> {
  constructor(cause: unknown) {
    super({ cause, message: 'Database initialization failed' })
  }
}

const acquireSql = Effect.acquireRelease(
  Effect.try({
    catch: (cause) => new DatabaseConnectionError(cause),
    try: () =>
      new SQL({
        ...(env.POSTGRES_HOST.startsWith('/') ? { path: env.POSTGRES_HOST } : { hostname: env.POSTGRES_HOST }),
        database: env.POSTGRES_DATABASE,
        password: env.POSTGRES_PASSWORD,
        port: env.POSTGRES_PORT,
        username: env.POSTGRES_USERNAME,
      }),
  }),
  (sql) => Effect.promise(() => sql.close())
)

export const DatabaseLive = Layer.effect(
  Database,
  Effect.gen(function* () {
    const sql = yield* acquireSql
    const db = drizzle({ client: sql })
    yield* Effect.tryPromise({
      catch: (cause) => new DatabaseConnectionError(cause),
      try: () => migrate(db, { migrationsFolder: './migrations' }),
    })
    return Database.of({ db, sql })
  })
)
