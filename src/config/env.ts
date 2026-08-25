import { Config, ConfigProvider, Context, Effect, FileSystem, Layer, Schema } from 'effect'

const FILE_SECRET_KEYS = [
  'PLEX_TOKEN',
  'RADARR_API_KEY',
  'SONARR_API_KEY',
  'TELEGRAM_CHAT_ID',
  'TELEGRAM_TOKEN',
  'TMDB_API_TOKEN',
  'TRAKT_CLIENT_ID',
  'TRAKT_CLIENT_SECRET',
  'POSTGRES_PASSWORD_FILE',
]

export const loadFileSecrets = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const secrets: Record<string, string> = {}
  for (const key of FILE_SECRET_KEYS) {
    const filePath = yield* Config.string(`${key}_FILE`).pipe(Effect.orElseSucceed(() => undefined))
    if (filePath === undefined) {
      continue
    }
    const content = yield* fileSystem.readFileString(filePath).pipe(Effect.orElseSucceed(() => undefined))
    if (content !== undefined) {
      secrets[key] = content.trim()
    }
  }
  return secrets
})

export const urlString = Schema.String.pipe(
  Schema.refine(
    (value): value is string => {
      try {
        return Boolean(new URL(value))
      } catch {
        return false
      }
    },
    { message: 'Expected URL' }
  )
)

const envConfig = Config.all({
  PLEX_TOKEN: Config.string('PLEX_TOKEN'),
  PLEX_URL: Config.schema(urlString, 'PLEX_URL'),
  POSTGRES_DATABASE: Config.string('POSTGRES_DATABASE'),
  POSTGRES_HOST: Config.string('POSTGRES_HOST'),
  POSTGRES_PASSWORD: Config.string('POSTGRES_PASSWORD').pipe(Config.withDefault(undefined)),
  POSTGRES_PORT: Config.number('POSTGRES_PORT'),
  POSTGRES_USERNAME: Config.string('POSTGRES_USERNAME'),
  RADARR_API_KEY: Config.string('RADARR_API_KEY'),
  RADARR_API_URL: Config.schema(urlString, 'RADARR_API_URL'),
  SONARR_API_KEY: Config.string('SONARR_API_KEY'),
  SONARR_API_URL: Config.schema(urlString, 'SONARR_API_URL'),
  TELEGRAM_CHAT_ID: Config.number('TELEGRAM_CHAT_ID'),
  TELEGRAM_TOKEN: Config.string('TELEGRAM_TOKEN'),
  TMDB_API_TOKEN: Config.string('TMDB_API_TOKEN'),
  TMDB_API_URL: Config.schema(urlString, 'TMDB_API_URL'),
  TRAKT_CLIENT_ID: Config.string('TRAKT_CLIENT_ID'),
  TRAKT_CLIENT_SECRET: Config.string('TRAKT_CLIENT_SECRET'),
  TRANSCODE_PATH: Config.string('TRANSCODE_PATH'),
})

export const loadEnv = Effect.gen(function* () {
  const secrets = yield* loadFileSecrets
  const provider = ConfigProvider.orElse(ConfigProvider.fromEnvRecord(secrets), ConfigProvider.fromEnv())
  return yield* envConfig.pipe(Effect.provideService(ConfigProvider.ConfigProvider, provider))
})

export type EnvValues = Effect.Success<typeof loadEnv>

export class Env extends Context.Service<Env, EnvValues>()('autoscan/config/env') {}

export const EnvLive = Layer.effect(Env, loadEnv)
