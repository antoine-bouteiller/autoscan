import { Schema } from 'effect'

import { safeReadFileSync } from '@/shared/utils/fs'
import { NumberFromUnknown } from '@/shared/utils/schema'

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

export const loadFileSecrets = (target: Record<string, string | undefined>): void => {
  for (const key of FILE_SECRET_KEYS) {
    const filePath = target[`${key}_FILE`]
    if (filePath !== undefined) {
      const content = safeReadFileSync(filePath)
      if (typeof content === 'string') {
        target[key] = content.trim()
      }
    }
  }
}

loadFileSecrets(process.env)

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

const envSchema = Schema.Struct({
  PLEX_TOKEN: Schema.String,
  PLEX_URL: urlString,
  POSTGRES_DATABASE: Schema.String,
  POSTGRES_HOST: Schema.String,
  POSTGRES_PASSWORD: Schema.optional(Schema.String),
  POSTGRES_PORT: NumberFromUnknown,
  POSTGRES_USERNAME: Schema.String,
  RADARR_API_KEY: Schema.String,
  RADARR_API_URL: urlString,
  SONARR_API_KEY: Schema.String,
  SONARR_API_URL: urlString,
  TELEGRAM_CHAT_ID: NumberFromUnknown,
  TELEGRAM_TOKEN: Schema.String,
  TMDB_API_TOKEN: Schema.String,
  TMDB_API_URL: urlString,
  TRAKT_CLIENT_ID: Schema.String,
  TRAKT_CLIENT_SECRET: Schema.String,
  TRANSCODE_PATH: Schema.String,
})

const env = Schema.decodeUnknownSync(envSchema, { errors: 'all' })(process.env)

export default env
