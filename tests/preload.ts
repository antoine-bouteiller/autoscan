import { afterAll } from 'bun:test'

import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { Effect } from 'effect'

const container = await new PostgreSqlContainer('postgres:18-alpine').start()

Object.assign(process.env, {
  NODE_ENV: 'test',
  PLEX_URL: 'http://plex.test',
  POSTGRES_DATABASE: container.getDatabase(),
  POSTGRES_HOST: container.getHost(),
  POSTGRES_PASSWORD: container.getPassword(),
  POSTGRES_PORT: String(container.getPort()),
  POSTGRES_USERNAME: container.getUsername(),
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
      yield* Effect.promise(() => container.stop())
    })
  )
)
