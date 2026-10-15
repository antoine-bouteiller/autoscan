import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { type SQL, type TransactionSQL } from 'bun'

const lock = (tx: TransactionSQL) => tx`SELECT pg_advisory_xact_lock(4207731519)`

const listMigrations = async (folder: string) => {
  const entries = await readdir(folder, { withFileTypes: true })
  const names: string[] = []
  for (const entry of entries) {
    if (entry.isDirectory() && (await Bun.file(join(folder, entry.name, 'migration.sql')).exists())) {
      names.push(entry.name)
    }
  }
  return names.toSorted()
}

const adoptDrizzleHistory = async (tx: TransactionSQL, names: readonly string[]) => {
  const [state]: { drizzle: boolean; empty: boolean }[] = await tx`
    SELECT
      NOT EXISTS (SELECT 1 FROM public.schema_migrations) AS empty,
      to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS drizzle
  `
  if (state === undefined || !state.empty || !state.drizzle) {
    return
  }
  const rows: { name: string | null }[] = await tx`SELECT name FROM drizzle.__drizzle_migrations`
  const adopted = rows.map(({ name }) => name).filter((name): name is string => name !== null && names.includes(name))
  if (adopted.length !== rows.length) {
    throw new Error('drizzle.__drizzle_migrations has rows without a matching migration directory')
  }
  await tx`INSERT INTO public.schema_migrations (name) SELECT unnest(${tx.array(adopted, 'text')}::text[])`
}

/** Applies every migration directory in `folder` not yet recorded in `public.schema_migrations`. */
export const migrate = async (sql: SQL, folder: string): Promise<void> => {
  const names = await listMigrations(folder)
  await sql.begin(async (tx) => {
    await lock(tx)
    await tx`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `
    await adoptDrizzleHistory(tx, names)
  })
  const rows: { name: string }[] = await sql`SELECT name FROM public.schema_migrations`
  const recorded = new Set(rows.map(({ name }) => name))
  for (const name of names.filter((candidate) => !recorded.has(candidate))) {
    const text = await Bun.file(join(folder, name, 'migration.sql')).text()
    await sql.begin(async (tx) => {
      await lock(tx)
      const [applied] = await tx`SELECT 1 FROM public.schema_migrations WHERE name = ${name}`
      if (applied !== undefined) {
        return
      }
      await tx.unsafe(text)
      await tx`INSERT INTO public.schema_migrations (name) VALUES (${name})`
    })
  }
}
