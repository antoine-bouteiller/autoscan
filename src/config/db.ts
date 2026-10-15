import { SQL } from 'bun'
import { Effect, Layer, Schema } from 'effect'

import { Env, type EnvValues } from '@/config/env'
import { Database } from '@/core/runtime.service'
import { migrate } from '@/database/migrator'

export class DatabaseQueryError extends Schema.TaggedError<DatabaseQueryError, { readonly brand: unique symbol }>()('DatabaseQueryError', {
  cause: Schema.Unknown,
}) {
  override get message() {
    return 'Database query failed'
  }
}

class DatabaseConnectionError extends Schema.TaggedError<DatabaseConnectionError, { readonly brand: unique symbol }>()('DatabaseConnectionError', {
  cause: Schema.Unknown,
}) {
  override get message() {
    return 'Database initialization failed'
  }
}

interface DatabaseResourceOperations<Sql> {
  readonly close: (sql: Sql) => Promise<void>
  readonly migrate: (sql: Sql) => Promise<unknown>
  readonly open: () => Sql
}

/** @internal */
export const makeDatabaseResource = <Sql>(operations: DatabaseResourceOperations<Sql>) =>
  Effect.gen(function* () {
    const sql = yield* Effect.acquireRelease(
      Effect.try({ catch: (cause) => DatabaseConnectionError.make({ cause }), try: operations.open }),
      (resource) => Effect.promise(() => operations.close(resource))
    )
    yield* Effect.tryPromise({ catch: (cause) => DatabaseConnectionError.make({ cause }), try: () => operations.migrate(sql) })
    return sql
  })

const databaseResource = (env: EnvValues) =>
  makeDatabaseResource({
    close: (sql: SQL) => sql.close(),
    migrate: (sql) => migrate(sql, './migrations'),
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
  Env.pipe(Effect.flatMap((env) => databaseResource(env).pipe(Effect.map((sql) => Database.of({ sql })))))
)
