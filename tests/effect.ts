import { DatabaseTestLayer } from '@tests/database'
import { MockPlexClient, MockRadarrClient, MockSonarrClient, MockTelegramClient, MockTmdbClient, MockTraktClient } from '@tests/utils'
import { Context, Effect, Layer, Logger } from 'effect'

import { BackgroundTasksLive, Ffmpeg, Plex, Radarr, Sonarr, Telegram, Tmdb, Trakt, type AppRequirements } from '@/core/runtime.service'
import { TraktAuthenticationTasksLive } from '@/features/trakt_sync/services/authentication.service'
import { TranscodeScanLive } from '@/features/transcoding/jobs/transcode.job'
import { TranscodeQueueLive } from '@/features/transcoding/services/transcode.service'
import { type IRadarrClient } from '@/integrations/arr/radarr.service'
import { type ISonarrClient } from '@/integrations/arr/sonarr.service'
import { FfmpegClient, type IFfmpegClient } from '@/integrations/ffmpeg/ffmpeg.service'
import { type IPlexClient } from '@/integrations/plex/plex.service'
import { type ITelegramClient } from '@/integrations/telegram/telegram.service'
import { type ITmdbClient } from '@/integrations/tmdb/tmdb.service'
import { type ITraktClient } from '@/integrations/trakt/trakt.service'

interface TestServices {
  ffmpeg?: IFfmpegClient
  plex?: IPlexClient
  radarr?: IRadarrClient
  sonarr?: ISonarrClient
  telegram?: ITelegramClient
  tmdb?: ITmdbClient
  trakt?: ITraktClient
}
export const TestLoggerLive = Logger.layer([])

export const makeTestLayer = (services: TestServices = {}) => {
  const clients = Layer.mergeAll(
    Layer.succeed(Ffmpeg, services.ffmpeg ?? new FfmpegClient()),
    Layer.succeed(Plex, services.plex ?? new MockPlexClient()),
    Layer.succeed(Radarr, services.radarr ?? new MockRadarrClient()),
    Layer.succeed(Sonarr, services.sonarr ?? new MockSonarrClient()),
    Layer.succeed(Telegram, services.telegram ?? new MockTelegramClient()),
    Layer.succeed(Tmdb, services.tmdb ?? new MockTmdbClient()),
    Layer.succeed(Trakt, services.trakt ?? new MockTraktClient())
  )
  const base = Layer.mergeAll(clients, DatabaseTestLayer, TraktAuthenticationTasksLive)
  const queue = TranscodeQueueLive.pipe(Layer.provideMerge(base))
  const background = BackgroundTasksLive.pipe(Layer.provideMerge(queue))
  return TranscodeScanLive.pipe(Layer.provideMerge(background))
}

export const makeTestContext = (services: TestServices = {}, loggers: ReadonlySet<Logger.Logger<unknown, unknown>> = new Set()) =>
  Layer.build(makeTestLayer(services)).pipe(Effect.map((context) => Context.add(context, Logger.CurrentLoggers, loggers)))

export const runTest = <Success, Error>(effect: Effect.Effect<Success, Error, AppRequirements>, services?: TestServices): Promise<Success> =>
  Effect.runPromise(effect.pipe(Effect.provide(makeTestLayer(services)), Effect.scoped, Effect.provide(TestLoggerLive)))
