import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { Effect } from 'effect'

import { AppConfig } from '@/config/app_config'

export class DatabaseService extends Effect.Service<DatabaseService>()('DatabaseService', {
  dependencies: [AppConfig.Default],
  effect: Effect.gen(function* () {
    const config = yield* AppConfig
    const sqlite = new Database(config.DATABASE_URL)
    const db = drizzle({ client: sqlite })
    migrate(db, { migrationsFolder: './migrations' })
    return db
  }),
}) {}
