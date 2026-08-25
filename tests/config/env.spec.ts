import { afterEach, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'

import { BunServices } from '@effect/platform-bun'
import { testEnv as env } from '@tests/env'
import { describe, expect, it } from '@tests/it'
import { Config, ConfigProvider, Effect, FileSystem, Result, Schema } from 'effect'

import { loadFileSecrets, urlString } from '@/config/env'

describe('env', () => {
  test('should expose required keys from the environment', () => {
    expect(env.PLEX_TOKEN).toBe(Effect.runSync(Config.string('PLEX_TOKEN')))
    expect(env.TRANSCODE_PATH).toBe(Effect.runSync(Config.string('TRANSCODE_PATH')))
  })

  test('should coerce TELEGRAM_CHAT_ID to a number', () => {
    expect(typeof env.TELEGRAM_CHAT_ID).toBe('number')
    expect(env.TELEGRAM_CHAT_ID).toBe(Number(Effect.runSync(Config.string('TELEGRAM_CHAT_ID'))))
  })
})

const tempFiles: string[] = []

const writeTempSecret = (value: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const filePath = `${tmpdir()}/autoscan-test-${randomUUID()}.txt`
    yield* fileSystem.writeFileString(filePath, value)
    tempFiles.push(filePath)
    return filePath
  })

const removeTempFiles = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  yield* Effect.forEach(tempFiles.splice(0), (file) => Effect.ignore(fileSystem.remove(file)), { discard: true })
}).pipe(Effect.provide(BunServices.layer))

const fileSecrets = (variables: Record<string, string>) =>
  loadFileSecrets.pipe(Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnvRecord(variables)))

describe('loadFileSecrets', () => {
  afterEach(() => Effect.runPromise(removeTempFiles))

  it.live('should load secret from _FILE path and trim whitespace', () =>
    Effect.gen(function* () {
      const filePath = yield* writeTempSecret('  my-secret\n')

      expect(yield* fileSecrets({ PLEX_TOKEN_FILE: filePath })).toEqual({ PLEX_TOKEN: 'my-secret' })
    }).pipe(Effect.provide(BunServices.layer))
  )

  it.live('should return no secret when no _FILE var is set', () =>
    Effect.gen(function* () {
      expect(yield* fileSecrets({ PLEX_TOKEN: 'existing' })).toEqual({})
    }).pipe(Effect.provide(BunServices.layer))
  )

  it.live('should return no secret when _FILE points to missing path', () =>
    Effect.gen(function* () {
      expect(yield* fileSecrets({ PLEX_TOKEN: 'existing', PLEX_TOKEN_FILE: '/nonexistent/path' })).toEqual({})
    }).pipe(Effect.provide(BunServices.layer))
  )

  it.live('should load multiple secrets from different _FILE paths', () =>
    Effect.gen(function* () {
      const plexFile = yield* writeTempSecret('plex-secret')
      const tmdbFile = yield* writeTempSecret('tmdb-secret')

      expect(yield* fileSecrets({ PLEX_TOKEN_FILE: plexFile, TMDB_API_TOKEN_FILE: tmdbFile })).toEqual({
        PLEX_TOKEN: 'plex-secret',
        TMDB_API_TOKEN: 'tmdb-secret',
      })
    }).pipe(Effect.provide(BunServices.layer))
  )
})

describe('urlString', () => {
  test('should accept valid http URLs', () => {
    expect(Result.isSuccess(Schema.decodeResult(urlString)('http://example.com'))).toBe(true)
  })

  test('should accept valid https URLs', () => {
    expect(Result.isSuccess(Schema.decodeResult(urlString)('https://example.com/path?q=1'))).toBe(true)
  })

  test('should reject empty strings', () => {
    expect(Result.isFailure(Schema.decodeResult(urlString)(''))).toBe(true)
  })

  test('should reject non-URL strings', () => {
    const result = Schema.decodeResult(urlString)('not a url at all')
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure.message).toBe('Expected URL')
    }
  })
})
