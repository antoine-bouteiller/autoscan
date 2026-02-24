import type { Database } from 'bun:sqlite'

import { logger } from '@/config/logger'
import { migrations } from '@/migrations'

class DrizzleMigration {
  name: string

  constructor(name: string) {
    this.name = name
  }
}

export const runMigrations = (sqlite: Database) => {
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const appliedMigrations = sqlite.query(`SELECT name FROM __drizzle_migrations`).as(DrizzleMigration).all()

  const appliedNames = new Set(appliedMigrations.map((m) => m.name))

  const runTx = sqlite.transaction(() => {
    let count = 0
    for (const migration of migrations) {
      if (!appliedNames.has(migration.name)) {
        logger.info(`Running migration: ${migration.name}`)
        for (const statement of migration.statements) {
          sqlite.run(statement)
        }

        sqlite.query(`INSERT INTO __drizzle_migrations (name) VALUES (?)`).run(migration.name)
        count++
      }
    }
    return count
  })

  const runCount = runTx()
  if (runCount > 0) {
    logger.info(`✅ Successfully applied ${runCount} new migrations.`)
  } else {
    logger.info(`✅ Database is up to date.`)
  }
}
