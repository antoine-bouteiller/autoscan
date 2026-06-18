import { type PgAsyncDatabase, type PgQueryResultHKT } from 'drizzle-orm/pg-core'

import env, { isEnvironmentEnv } from '#/config/env'
import { safeExistsSync, safeMkdirSync } from '#/shared/utils/fs'

// Both the bun-sql (production) and pglite (dev/test) databases extend `PgAsyncDatabase`; typing against this pg-core base keeps `db` dialect-neutral and avoids importing the bun-sql driver (which pulls in the native `bun` module) under the Node-based Vitest runner.
type Database = PgAsyncDatabase<PgQueryResultHKT>

const initDatabase = async (): Promise<Database> => {
  if (isEnvironmentEnv(env, 'production')) {
    const { drizzle } = await import('drizzle-orm/bun-sql')
    const { migrate } = await import('drizzle-orm/bun-sql/migrator')

    const db = drizzle({
      connection: {
        database: env.POSTGRES_DATABASE,
        hostname: env.POSTGRES_HOST,
        password: env.POSTGRES_PASSWORD,
        port: env.POSTGRES_PORT,
        username: env.POSTGRES_USERNAME,
      },
    })
    await migrate(db, { migrationsFolder: './migrations' })
    return db
  }

  const { drizzle } = await import('drizzle-orm/pglite')
  const { migrate } = await import('drizzle-orm/pglite/migrator')

  if (isEnvironmentEnv(env, 'development') && !safeExistsSync(env.DATABASE_URL)) {
    safeMkdirSync(env.DATABASE_URL)
  }

  const db = drizzle(isEnvironmentEnv(env, 'development') ? env.DATABASE_URL : 'memory://')
  await migrate(db, { migrationsFolder: './migrations' })
  return db
}

export const db = await initDatabase()
