import { z } from 'zod'

import { safeReadFileSync } from '#/shared/utils/fs'

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
    if (filePath) {
      const content = safeReadFileSync(filePath)
      if (typeof content === 'string') {
        target[key] = content.trim()
      }
    }
  }
}

loadFileSecrets(process.env)

export const urlString = z.string().refine((value) => {
  try {
    const url = new URL(value)
    return Boolean(url)
  } catch {
    return false
  }
}, 'Expected URL')

const baseSchema = z.object({
  PLEX_TOKEN: z.string(),
  PLEX_URL: urlString,
  RADARR_API_KEY: z.string(),
  RADARR_API_URL: urlString,
  SONARR_API_KEY: z.string(),
  SONARR_API_URL: urlString,
  TELEGRAM_CHAT_ID: z.coerce.number(),
  TELEGRAM_TOKEN: z.string(),
  TMDB_API_TOKEN: z.string(),
  TMDB_API_URL: urlString,
  TRAKT_CLIENT_ID: z.string(),
  TRAKT_CLIENT_SECRET: z.string(),
  TRANSCODE_PATH: z.string(),
})

const envSchema = baseSchema.and(
  z.discriminatedUnion('NODE_ENV', [
    z.object({ DATABASE_URL: z.string(), NODE_ENV: z.literal('development') }),
    z.object({
      NODE_ENV: z.literal('production'),
      POSTGRES_DATABASE: z.string(),
      POSTGRES_HOST: z.string(),
      POSTGRES_PASSWORD: z.string().optional(),
      POSTGRES_PORT: z.coerce.number(),
      POSTGRES_USERNAME: z.string(),
    }),
    z.object({
      NODE_ENV: z.literal('test'),
    }),
  ])
)

const env = envSchema.parse(process.env)

export default env
type Env = typeof env

export const isEnvironmentEnv = <TEnv extends Env['NODE_ENV']>(
  _envToValidate: Env,
  envName: TEnv
): _envToValidate is Extract<typeof env, { NODE_ENV: TEnv }> => process.env['NODE_ENV'] === envName
