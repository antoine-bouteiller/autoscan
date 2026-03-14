import { existsSync, mkdirSync } from 'node:fs'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'

import env from '@/config/env'
import { runMigrations } from '@/utils/run_migrations'

const dataDir = env.DATABASE_URL

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true })
}

const client = new PGlite(dataDir)
export const db = drizzle({ client })

await runMigrations(client)
