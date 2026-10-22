import { afterAll } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Effect } from 'effect'

// Throwaway cluster on a unix socket; `initdb`/`pg_ctl` come from the Nix devShell.
const dataDir = await mkdtemp(join(tmpdir(), 'autoscan-pg-'))
const username = 'autoscan'

const run = async (cmd: string[]) => {
  const proc = Bun.spawn(cmd, { stderr: 'pipe', stdout: 'pipe' })
  if ((await proc.exited) !== 0) {
    throw new Error(`${cmd.join(' ')} failed:\n${await new Response(proc.stderr).text()}`)
  }
}

await run(['initdb', '--pgdata', dataDir, '--auth', 'trust', '--username', username, '--no-sync'])
await run([
  'pg_ctl',
  'start',
  '--wait',
  '--pgdata',
  dataDir,
  '--log',
  join(dataDir, 'postgres.log'),
  '--options',
  `-k ${dataDir} -c listen_addresses='' -c fsync=off -c synchronous_commit=off -c full_page_writes=off`,
])

Object.assign(process.env, {
  BAZARR_API_KEY: 'test-bazarr-key',
  BAZARR_API_URL: 'http://bazarr.test',
  BAZARR_FRENCH_PROFILE: 'French forced',
  NODE_ENV: 'test',
  PLEX_URL: 'http://plex.test',
  POSTGRES_DATABASE: 'postgres',
  POSTGRES_HOST: dataDir,
  POSTGRES_PORT: '5432',
  POSTGRES_USERNAME: username,
  RADARR_API_KEY: 'test-radarr-key',
  RADARR_API_URL: 'http://radarr.test',
  SONARR_API_KEY: 'test-sonarr-key',
  SONARR_API_URL: 'http://sonarr.test',
  TELEGRAM_CHAT_ID: '123456789',
  TELEGRAM_TOKEN: 'test-telegram-token',
  TMDB_API_TOKEN: 'test-tmdb-token',
  TMDB_API_URL: 'http://tmdb.test',
  TRANSCODE_PATH: 'resources/transcode',
})

afterAll(() =>
  Effect.runPromise(
    Effect.gen(function* () {
      const { closeTestDatabase } = yield* Effect.promise(() => import('./database.js'))
      yield* Effect.promise(() => closeTestDatabase())
      yield* Effect.promise(() => run(['pg_ctl', 'stop', '--pgdata', dataDir, '--mode', 'fast']))
      yield* Effect.promise(() => rm(dataDir, { force: true, recursive: true }))
    })
  )
)
