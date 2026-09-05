import { BunServices } from '@effect/platform-bun'
import { DatabaseTestLayer } from '@tests/database'
import { EnvTestLayer } from '@tests/env'
import { MockPlexClient, MockRadarrClient, MockSonarrClient, MockTelegramClient, MockTmdbClient } from '@tests/utils'
import { Context, Effect, Layer, Logger } from 'effect'

import {
  AuthenticationTasksLive,
  BackgroundTasksLive,
  Ffmpeg,
  Plex,
  Radarr,
  Sonarr,
  Telegram,
  Tmdb,
  type AppRequirements,
} from '@/core/runtime.service'
import { PlexTokenStoreLive } from '@/features/plex_auth/services/plex_token.service'
import { TranscodeScanLive } from '@/features/transcoding/jobs/transcode.job'
import { TranscodeQueueLive } from '@/features/transcoding/services/transcode.service'
import { type IRadarrClient } from '@/integrations/arr/radarr.service'
import { type ISonarrClient } from '@/integrations/arr/sonarr.service'
import { makeFfmpegClient, type IFfmpegClient } from '@/integrations/ffmpeg/ffmpeg.service'
import { type IPlexClient } from '@/integrations/plex/plex.service'
import { type ITelegramClient } from '@/integrations/telegram/telegram.service'
import { type ITmdbClient } from '@/integrations/tmdb/tmdb.service'

interface TestServices {
  ffmpeg?: IFfmpegClient
  plex?: IPlexClient
  radarr?: IRadarrClient
  sonarr?: ISonarrClient
  telegram?: ITelegramClient
  tmdb?: ITmdbClient
}
export const TestLoggerLive = Logger.layer([])

const makeTestLayer = (services: TestServices = {}) => {
  const ffmpeg =
    services.ffmpeg === undefined
      ? Layer.effect(Ffmpeg, makeFfmpegClient).pipe(Layer.provide(Layer.mergeAll(BunServices.layer, EnvTestLayer)))
      : Layer.succeed(Ffmpeg, services.ffmpeg)
  const clients = Layer.mergeAll(
    ffmpeg,
    Layer.succeed(Plex, services.plex ?? new MockPlexClient()),
    Layer.succeed(Radarr, services.radarr ?? new MockRadarrClient()),
    Layer.succeed(Sonarr, services.sonarr ?? new MockSonarrClient()),
    Layer.succeed(Telegram, services.telegram ?? new MockTelegramClient()),
    Layer.succeed(Tmdb, services.tmdb ?? new MockTmdbClient())
  )
  const base = Layer.mergeAll(clients, DatabaseTestLayer, EnvTestLayer, AuthenticationTasksLive, PlexTokenStoreLive, BunServices.layer)
  const queue = TranscodeQueueLive.pipe(Layer.provideMerge(base))
  const background = BackgroundTasksLive.pipe(Layer.provideMerge(queue))
  return TranscodeScanLive.pipe(Layer.provideMerge(background))
}

export const makeTestContext = (services: TestServices = {}, loggers: ReadonlySet<Logger.Logger<unknown, unknown>> = new Set()) =>
  Layer.build(makeTestLayer(services)).pipe(Effect.map((context) => Context.add(context, Logger.CurrentLoggers, loggers)))

export const provideTest = <Success, Error, Requirements>(effect: Effect.Effect<Success, Error, Requirements>, services?: TestServices) =>
  effect.pipe(Effect.provide(makeTestLayer(services)), Effect.scoped, Effect.provide(TestLoggerLive))

export const runTest = <Success, Error>(effect: Effect.Effect<Success, Error, AppRequirements>, services?: TestServices): Promise<Success> =>
  Effect.runPromise(provideTest(effect, services))
