import { Database } from 'bun:sqlite'

import { drizzle } from 'drizzle-orm/bun-sqlite'

import env from '@/config/env'
import { runMigrations } from '@/utils/run_migrations'

const sqlite = new Database(env.DATABASE_URL)
export const db = drizzle({ client: sqlite })

runMigrations(sqlite)
