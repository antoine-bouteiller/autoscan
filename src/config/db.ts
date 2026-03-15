import { existsSync, mkdirSync } from 'node:fs'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'

import env from '#config/env'

const dataBasePath = env.DATABASE_URL

if (dataBasePath !== 'memory://' && !existsSync(dataBasePath)) {
  mkdirSync(dataBasePath, { recursive: true })
}

const client = new PGlite(dataBasePath)
export const db = drizzle({ client })

await migrate(db, { migrationsFolder: './migrations' })
