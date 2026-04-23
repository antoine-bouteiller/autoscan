import { type PgliteDatabase } from 'drizzle-orm/pglite'
import { type PostgresJsDatabase } from 'drizzle-orm/postgres-js'

import env, { isEnvironmentEnv } from '#/config/env'
import { safeExistsSync, safeMkdirSync } from '#/shared/utils/fs'

type Database = PostgresJsDatabase | PgliteDatabase

const initDatabase = async (): Promise<Database> => {
  if (isEnvironmentEnv(env, 'production')) {
    const { drizzle } = await import('drizzle-orm/postgres-js')
    const { migrate } = await import('drizzle-orm/postgres-js/migrator')

    const db = drizzle({
      connection: {
        database: env.POSTGRES_DATABASE,
        host: env.POSTGRES_HOST,
        password: env.POSTGRES_PASSWORD,
        port: env.POSTGRES_PORT,
        user: env.POSTGRES_USERNAME,
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
