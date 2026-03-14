import type { PGlite } from '@electric-sql/pglite'

import { logger } from '@/config/logger'
import { migrations } from '@/migrations'

export const runMigrations = async (client: PGlite) => {
  await client.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const appliedMigrations = await client.query<{ name: string }>(`SELECT name FROM __drizzle_migrations`)
  const appliedNames = new Set(appliedMigrations.rows.map((m) => m.name))

  let count = 0
  for (const migration of migrations) {
    if (!appliedNames.has(migration.name)) {
      logger.info(`Running migration: ${migration.name}`)
      for (const statement of migration.statements) {
        await client.exec(statement)
      }

      await client.query(`INSERT INTO __drizzle_migrations (name) VALUES ($1)`, [migration.name])
      count++
    }
  }

  if (count > 0) {
    logger.info(`Successfully applied ${count} new migrations.`)
  } else {
    logger.info(`Database is up to date.`)
  }
}
