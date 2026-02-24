import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { drizzle } from 'drizzle-orm/bun-sqlite'

import env from '@/config/env'
import { runMigrations } from '@/utils/run_migrations'

const dbPath = env.DATABASE_URL

const dir = dirname(dbPath)

if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true })
}
const sqlite = new Database(dbPath)
export const db = drizzle({ client: sqlite })

runMigrations(sqlite)
