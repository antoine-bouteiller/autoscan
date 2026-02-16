import { Config, Effect } from 'effect'
import { join } from 'node:path'

export class AppConfig extends Effect.Service<AppConfig>()('AppConfig', {
  accessors: true,
  effect: Effect.gen(function* () {
    return {
      CLOUDFLARE_TOKEN: yield* Config.redacted('CLOUDFLARE_TOKEN'),
      DATABASE_URL: join(import.meta.dirname, '../../resources/autoscan.db'),
      DOMAIN: yield* Config.string('DOMAIN'),
      PLEX_TOKEN: yield* Config.redacted('PLEX_TOKEN'),
      PLEX_URL: yield* Config.string('PLEX_URL'),
      RADARR_API_KEY: yield* Config.redacted('RADARR_API_KEY'),
      RADARR_API_URL: yield* Config.string('RADARR_API_URL'),
      SONARR_API_KEY: yield* Config.redacted('SONARR_API_KEY'),
      SONARR_API_URL: yield* Config.string('SONARR_API_URL'),
      TELEGRAM_CHAT_ID: yield* Config.number('TELEGRAM_CHAT_ID'),
      TELEGRAM_TOKEN: yield* Config.redacted('TELEGRAM_TOKEN'),
      TMDB_API_TOKEN: yield* Config.redacted('TMDB_API_TOKEN'),
      TMDB_API_URL: yield* Config.string('TMDB_API_URL'),
      NODE_ENV: yield* Config.string('NODE_ENV').pipe(Config.withDefault('development')),
    }
  }),
}) {}
