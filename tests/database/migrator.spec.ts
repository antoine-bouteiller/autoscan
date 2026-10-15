import { afterEach } from 'bun:test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { testEnv as env } from '@tests/env'
import { describe, expect, it } from '@tests/it'
import { SQL } from 'bun'

import { migrate } from '@/database/migrator'

const MIGRATIONS = './migrations'

const connect = (database: string) =>
  new SQL({
    ...(env.POSTGRES_HOST.startsWith('/') ? { path: env.POSTGRES_HOST } : { hostname: env.POSTGRES_HOST }),
    database,
    max: 2,
    password: env.POSTGRES_PASSWORD,
    port: env.POSTGRES_PORT,
    username: env.POSTGRES_USERNAME,
  })

const admin = connect(env.POSTGRES_DATABASE)
const cleanups: (() => Promise<unknown>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).toReversed()) {
    await cleanup()
  }
})

const freshDatabase = async () => {
  const name = `migrator_${crypto.randomUUID().replaceAll('-', '')}`
  await admin.unsafe(`CREATE DATABASE ${name}`)
  const clients: SQL[] = []
  cleanups.push(async () => {
    await Promise.all(clients.map((client) => client.close()))
    await admin.unsafe(`DROP DATABASE ${name} WITH (FORCE)`)
  })
  return () => {
    const client = connect(name)
    clients.push(client)
    return client
  }
}

const tempFolder = async (files: Record<string, string>) => {
  const folder = await mkdtemp(join(tmpdir(), 'migrator-'))
  cleanups.push(() => rm(folder, { force: true, recursive: true }))
  for (const [name, text] of Object.entries(files)) {
    await Bun.write(join(folder, name, 'migration.sql'), text)
  }
  return folder
}

const migrationNames = async () => {
  const names = await readdir(MIGRATIONS)
  return names.toSorted()
}

const rejection = (run: Promise<unknown>) =>
  run.then(
    () => '',
    (error: unknown) => String(error)
  )

const recordedNames = async (sql: SQL) => {
  const rows: { name: string }[] = await sql`SELECT name FROM public.schema_migrations ORDER BY name`
  return rows.map(({ name }) => name)
}

const hasTrackingTable = async (sql: SQL) => {
  const [row]: { exists: boolean }[] = await sql`SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists`
  return row?.exists
}

const applyLikeDrizzle = async (sql: SQL, names: readonly string[]) => {
  await sql`CREATE SCHEMA drizzle`
  await sql`
    CREATE TABLE drizzle.__drizzle_migrations (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint,
      name text,
      applied_at timestamptz DEFAULT now()
    )
  `
  for (const name of names) {
    await sql.unsafe(await Bun.file(join(MIGRATIONS, name, 'migration.sql')).text())
    await sql`INSERT INTO drizzle.__drizzle_migrations (hash, name) VALUES ('', ${name})`
  }
}

const describeSchema = async (sql: SQL) => ({
  columns: [
    ...(await sql`
      SELECT table_name, column_name, udt_name, is_nullable, coalesce(column_default, '') AS column_default
      FROM information_schema.columns WHERE table_schema = 'public' AND table_name <> 'schema_migrations'
      ORDER BY table_name, column_name
    `),
  ],
  constraints: [
    ...(await sql`
      SELECT conrelid::regclass::text AS tbl, pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'p' AND conrelid::regclass::text <> 'schema_migrations'
      ORDER BY 1
    `),
  ],
  enums: [
    ...(await sql`
      SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text AS labels
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid GROUP BY t.typname ORDER BY t.typname
    `),
  ],
})

const column = (path: string, udt_name: string, options: { readonly defaultValue?: string; readonly nullable?: boolean } = {}) => {
  const [table_name, column_name] = path.split('.')
  return {
    column_default: options.defaultValue ?? '',
    column_name,
    is_nullable: options.nullable === true ? 'YES' : 'NO',
    table_name,
    udt_name,
  }
}

const CURRENT_SCHEMA = {
  columns: [
    column('french_profiles.assigned_at', 'timestamp'),
    column('french_profiles.bazarr_id', 'int4'),
    column('french_profiles.bazarr_kind', 'bazarr_kind'),
    column('french_profiles.released_at', 'timestamp', { nullable: true }),
    column('media.original_language', 'text'),
    column('media.preferred_language', 'text'),
    column('media.title', 'text'),
    column('media.tmdb_id', 'int4'),
    column('media.type', 'media_type'),
    column('missing_subtitles.acted_at', 'timestamp', { nullable: true }),
    column('missing_subtitles.bazarr_id', 'int4'),
    column('missing_subtitles.bazarr_kind', 'bazarr_kind'),
    column('missing_subtitles.first_seen_at', 'timestamp'),
    column('missing_subtitles.language', 'text'),
    column('plex_tokens.auth_token', 'text'),
    column('plex_tokens.client_identifier', 'text'),
    column('plex_tokens.id', 'int4', { defaultValue: "nextval('plex_tokens_id_seq'::regclass)" }),
    column('plex_tokens.linked_at', 'timestamp'),
    column('subtitle_scans.file_path', 'text'),
    column('subtitle_scans.scan_version', 'int4'),
    column('subtitle_scans.scanned_at', 'timestamp'),
    column('subtitle_scans.verdict', 'subtitle_verdict'),
    column('transcode_scans.file_path', 'text'),
    column('transcode_scans.original_language', 'text'),
    column('transcode_scans.scan_version', 'int4'),
    column('transcode_scans.scanned_at', 'timestamp'),
  ],
  constraints: [
    { def: 'PRIMARY KEY (bazarr_kind, bazarr_id)', tbl: 'french_profiles' },
    { def: 'PRIMARY KEY (tmdb_id, type)', tbl: 'media' },
    { def: 'PRIMARY KEY (bazarr_kind, bazarr_id, language)', tbl: 'missing_subtitles' },
    { def: 'PRIMARY KEY (id)', tbl: 'plex_tokens' },
    { def: 'PRIMARY KEY (file_path)', tbl: 'subtitle_scans' },
    { def: 'PRIMARY KEY (file_path)', tbl: 'transcode_scans' },
  ],
  enums: [
    { labels: '{movie,episode}', typname: 'bazarr_kind' },
    { labels: '{movie,show}', typname: 'media_type' },
    { labels: '{passed,forced_removed,sync_requested,invalid}', typname: 'subtitle_verdict' },
  ],
}

describe('migrate', () => {
  it('[VC-1] creates the current schema on an empty database', async () => {
    const sql = (await freshDatabase())()

    await migrate(sql, MIGRATIONS)

    expect(await recordedNames(sql)).toEqual(await migrationNames())
    expect(await recordedNames(sql)).toHaveLength(8)
    expect(await describeSchema(sql)).toEqual(CURRENT_SCHEMA)
  })

  it('[VC-2] adopts a fully Drizzle-migrated database without executing any migration', async () => {
    const sql = (await freshDatabase())()
    const names = await migrationNames()
    await applyLikeDrizzle(sql, names)

    await migrate(sql, MIGRATIONS)

    expect(await recordedNames(sql)).toEqual(names)
    expect(await describeSchema(sql)).toEqual(CURRENT_SCHEMA)
    expect(await sql`SELECT name FROM drizzle.__drizzle_migrations`).toHaveLength(8)
  })

  it('[VC-3] runs only migrations newer than the Drizzle history, then nothing on a second run', async () => {
    const sql = (await freshDatabase())()
    const names = await migrationNames()
    await applyLikeDrizzle(sql, names.slice(0, 7))

    await migrate(sql, MIGRATIONS)
    expect(await recordedNames(sql)).toEqual(names)
    expect(await describeSchema(sql)).toEqual(CURRENT_SCHEMA)
    const before = [...(await sql`SELECT name, applied_at FROM public.schema_migrations ORDER BY name`)]

    await migrate(sql, MIGRATIONS)
    expect([...(await sql`SELECT name, applied_at FROM public.schema_migrations ORDER BY name`)]).toEqual(before)
  })

  it('[VC-4] keeps earlier migrations recorded and rolls back the failing one', async () => {
    const sql = (await freshDatabase())()
    const folder = await tempFolder({
      '20260101000000_first': 'CREATE TABLE first_table (id int);',
      '20260102000000_second': 'CREATE TABLE second_table (id int);\nSELECT * FROM missing_table;',
    })

    expect(await rejection(migrate(sql, folder))).toContain('missing_table')

    expect(await recordedNames(sql)).toEqual(['20260101000000_first'])
    expect([...(await sql`SELECT to_regclass('first_table') IS NOT NULL AS first, to_regclass('second_table') IS NOT NULL AS second`)]).toEqual([
      { first: true, second: false },
    ])
  })

  it('[VC-5] applies each migration exactly once under concurrent startups', async () => {
    const open = await freshDatabase()

    await Promise.all([migrate(open(), MIGRATIONS), migrate(open(), MIGRATIONS)])

    const sql = open()
    expect(await recordedNames(sql)).toEqual(await migrationNames())
    expect(await describeSchema(sql)).toEqual(CURRENT_SCHEMA)
  })

  it('refuses to adopt a Drizzle history naming an unknown or null migration', async () => {
    const unknown = (await freshDatabase())()
    await applyLikeDrizzle(unknown, [])
    await unknown`INSERT INTO drizzle.__drizzle_migrations (hash, name) VALUES ('', '20990101000000_unknown')`
    expect(await rejection(migrate(unknown, MIGRATIONS))).toContain('without a matching migration directory')
    expect(await hasTrackingTable(unknown)).toBe(false)

    await unknown`UPDATE drizzle.__drizzle_migrations SET name = NULL`
    expect(await rejection(migrate(unknown, MIGRATIONS))).toContain('without a matching migration directory')
    expect(await hasTrackingTable(unknown)).toBe(false)
  })

  it('ignores entries without a migration.sql file', async () => {
    const sql = (await freshDatabase())()
    const folder = await tempFolder({ '20260101000000_only': 'CREATE TABLE only_table (id int);' })
    await Bun.write(join(folder, 'README.md'), '')
    await Bun.write(join(folder, '20260102000000_empty', 'notes.txt'), '')

    await migrate(sql, folder)

    expect(await recordedNames(sql)).toEqual(['20260101000000_only'])
  })
})
