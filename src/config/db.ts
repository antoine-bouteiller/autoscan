import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

import env from '@/config/env'

const sqlite = new Database(env.DATABASE_URL)
export const db = drizzle(sqlite)

migrate(db, { migrationsFolder: './migrations' })
