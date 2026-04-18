import { type PgliteDatabase } from 'drizzle-orm/pglite'
import { type PostgresJsDatabase } from 'drizzle-orm/postgres-js'

import env from '#config/env'
import { safeExistsSync, safeMkdirSync } from '#shared/utils/fs'

type Database = PostgresJsDatabase | PgliteDatabase

const isPostgresUrl = (url: string) => url.startsWith('postgres://') || url.startsWith('postgresql://')

const initDatabase = async (): Promise<Database> => {
  const databaseUrl = env.DATABASE_URL

  if (isPostgresUrl(databaseUrl)) {
    const { drizzle } = await import('drizzle-orm/postgres-js')
    const { migrate } = await import('drizzle-orm/postgres-js/migrator')

    const db = drizzle(databaseUrl)
    await migrate(db, { migrationsFolder: './migrations' })
    return db
  }

  const { drizzle } = await import('drizzle-orm/pglite')
  const { migrate } = await import('drizzle-orm/pglite/migrator')

  if (databaseUrl !== 'memory://' && !safeExistsSync(databaseUrl)) {
    safeMkdirSync(databaseUrl)
  }

  const db = drizzle(databaseUrl)
  await migrate(db, { migrationsFolder: './migrations' })
  return db
}

export const db = await initDatabase()
