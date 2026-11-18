import assert from 'node:assert/strict'

import { BunServices } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'

import { Env } from '@/config/env'
import { makeFfmpegClient } from '@/integrations/ffmpeg/ffmpeg.service'

import known from '../../fixtures/speech/known.json'

const input = process.argv.at(2)
assert(input, 'Pass the generated speech.mka fixture path')
const environment = Layer.succeed(Env, {
  BAZARR_API_KEY: 'unused',
  BAZARR_API_URL: 'http://unused.test',
  BAZARR_FRENCH_PROFILE: 'unused',
  PLEX_URL: 'http://unused.test',
  POSTGRES_DATABASE: 'unused',
  POSTGRES_HOST: 'unused',
  POSTGRES_PASSWORD: undefined,
  POSTGRES_PORT: 5432,
  POSTGRES_USERNAME: 'unused',
  RADARR_API_KEY: 'unused',
  RADARR_API_URL: 'http://unused.test',
  SONARR_API_KEY: 'unused',
  SONARR_API_URL: 'http://unused.test',
  TELEGRAM_CHAT_ID: 1,
  TELEGRAM_TOKEN: 'unused',
  TMDB_API_TOKEN: 'unused',
  TMDB_API_URL: 'http://unused.test',
  TRANSCODE_PATH: 'unused',
})
const started = performance.now()
const result = await Effect.runPromise(
  Effect.gen(function* () {
    const client = yield* makeFfmpegClient
    const first = yield* client.sampleSpeech(input, known.speechStream, known.windows)
    const speech = first.flatMap((window) => window.speech)
    assert.equal(speech.length, known.speech.length)
    for (const [index, [start, end]] of speech.entries()) {
      assert(Math.abs(start - known.speech[index][0]) <= 0.3)
      assert(Math.abs(end - known.speech[index][1]) <= 0.3)
    }
    assert.deepEqual(first[2].speech, [])
    assert.deepEqual(yield* client.sampleSpeech(input, known.speechStream, known.windows), first)
    assert.deepEqual(yield* client.sampleSpeech(input, known.speechStream, [known.windows[1]]), [first[1]])
    const silent = yield* client.sampleSpeech(input, known.silentStream, known.windows)
    assert(silent.every((window) => window.speech.length === 0))
    return first
  }).pipe(Effect.provide([BunServices.layer, environment]))
)
process.stdout.write(`${JSON.stringify({ milliseconds: performance.now() - started, windows: result })}\n`)
