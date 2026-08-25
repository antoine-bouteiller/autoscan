import { SQL } from 'bun'
import { drizzle } from 'drizzle-orm/bun-sql'
import { migrate } from 'drizzle-orm/bun-sql/migrator'
import { Data, Effect, Layer } from 'effect'

import { Env, type EnvValues } from '@/config/env'
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

interface DatabaseResourceOperations<Sql, Db> {
  readonly close: (sql: Sql) => Promise<void>
  readonly construct: (sql: Sql) => Db
  readonly migrate: (db: Db) => Promise<unknown>
  readonly open: () => Sql
}

export const makeDatabaseResource = <Sql, Db>(operations: DatabaseResourceOperations<Sql, Db>) =>
  Effect.gen(function* () {
    const sql = yield* Effect.acquireRelease(Effect.try({ catch: (cause) => new DatabaseConnectionError(cause), try: operations.open }), (resource) =>
      Effect.promise(() => operations.close(resource))
    )
    const db = yield* Effect.try({ catch: (cause) => new DatabaseConnectionError(cause), try: () => operations.construct(sql) })
    yield* Effect.tryPromise({ catch: (cause) => new DatabaseConnectionError(cause), try: () => operations.migrate(db) })
    return { db, sql }
  })

const databaseResource = (env: EnvValues) =>
  makeDatabaseResource({
    close: (sql: SQL) => sql.close(),
    construct: (sql: SQL) => drizzle({ client: sql }),
    migrate: (db) => migrate(db, { migrationsFolder: './migrations' }),
    open: () =>
      new SQL({
        ...(env.POSTGRES_HOST.startsWith('/') ? { path: env.POSTGRES_HOST } : { hostname: env.POSTGRES_HOST }),
        database: env.POSTGRES_DATABASE,
        password: env.POSTGRES_PASSWORD,
        port: env.POSTGRES_PORT,
        username: env.POSTGRES_USERNAME,
      }),
  })

export const DatabaseLive = Layer.effect(
  Database,
  Env.pipe(Effect.flatMap((env) => databaseResource(env).pipe(Effect.map(({ db, sql }) => Database.of({ db, sql })))))
)
