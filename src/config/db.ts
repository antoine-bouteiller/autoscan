import { type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { type PgliteDatabase } from 'drizzle-orm/pglite'

import env from '#config/env'
import { safeExistsSync, safeMkdirSync } from '#shared/utils/fs'

type Database = NodePgDatabase | PgliteDatabase

const isPostgresUrl = (url: string) => url.startsWith('postgres://') || url.startsWith('postgresql://')

const initDatabase = async (): Promise<Database> => {
  const databaseUrl = env.DATABASE_URL

  if (isPostgresUrl(databaseUrl)) {
    const pg = await import('pg')
    const { drizzle } = await import('drizzle-orm/node-postgres')
    const { migrate } = await import('drizzle-orm/node-postgres/migrator')

    const client = new pg.default.Pool({ connectionString: databaseUrl })
    const db = drizzle({ client })
    await migrate(db, { migrationsFolder: './migrations' })
    return db
  }

  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const { migrate } = await import('drizzle-orm/pglite/migrator')

  if (databaseUrl !== 'memory://' && !safeExistsSync(databaseUrl)) {
    safeMkdirSync(databaseUrl)
  }

  const client = new PGlite(databaseUrl)
  const db = drizzle({ client })
  await migrate(db, { migrationsFolder: './migrations' })
  return db
}

export const db = await initDatabase()
