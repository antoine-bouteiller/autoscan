import { BunServices } from '@effect/platform-bun'
import { Effect, Fiber, FiberSet, Layer, Option } from 'effect'
import { isFailure as isExitFailure } from 'effect/Exit'

import { DatabaseLive } from '@/config/db'
import env from '@/config/env'
import { LoggerLive } from '@/config/logger'
import { registerFeatures } from '@/core/feature'
import {
  BackgroundTasks,
  BackgroundTasksLive,
  CallbackRuntime,
  Ffmpeg,
  Http,
  Plex,
  Radarr,
  Scheduler,
  Sonarr,
  Telegram,
  TelegramBot,
  Tmdb,
  Trakt,
  TranscodeQueue,
  TranscodeScan,
  type AppRequirements,
  type CallbackRuntimeShape,
  type TranscodeQueueShape,
  type WorkflowOwnerShape,
} from '@/core/runtime.service'
import { features } from '@/features/index'
import { TraktAuthenticationTasks, TraktAuthenticationTasksLive } from '@/features/trakt_sync/services/authentication.service'
import { TranscodeScanLive } from '@/features/transcoding/jobs/transcode.job'
import { TranscodeQueueLive } from '@/features/transcoding/services/transcode.service'
import { RadarrClient } from '@/integrations/arr/radarr.service'
import { SonarrClient } from '@/integrations/arr/sonarr.service'
import { makeFfmpegClient } from '@/integrations/ffmpeg/ffmpeg.service'
import { PlexClient } from '@/integrations/plex/plex.service'
import { TelegramClient } from '@/integrations/telegram/telegram.service'
import { TmdbClient } from '@/integrations/tmdb/tmdb.service'
import { TraktClient } from '@/integrations/trakt/trakt.service'
import { HttpProvider } from '@/providers/http/http.provider'
import { SchedulerProvider } from '@/providers/scheduler/scheduler.provider'
import { TelegramProvider } from '@/providers/telegram/telegram.provider'

const ClientsLive = Layer.mergeAll(
  Layer.effect(Ffmpeg, makeFfmpegClient).pipe(Layer.provide(BunServices.layer)),
  Layer.succeed(Plex, new PlexClient({ token: env.PLEX_TOKEN, url: env.PLEX_URL })),
  Layer.succeed(Radarr, new RadarrClient({ apiKey: env.RADARR_API_KEY, apiUrl: env.RADARR_API_URL })),
  Layer.succeed(Sonarr, new SonarrClient({ apiKey: env.SONARR_API_KEY, apiUrl: env.SONARR_API_URL })),
  Layer.succeed(Telegram, new TelegramClient(env.TELEGRAM_TOKEN)),
  Layer.succeed(Tmdb, new TmdbClient({ apiToken: env.TMDB_API_TOKEN, apiUrl: env.TMDB_API_URL })),
  Layer.succeed(Trakt, new TraktClient({ clientId: env.TRAKT_CLIENT_ID, clientSecret: env.TRAKT_CLIENT_SECRET }))
)

const BaseLive = Layer.mergeAll(ClientsLive, DatabaseLive, TraktAuthenticationTasksLive, BunServices.layer)
const QueueGraph = TranscodeQueueLive.pipe(Layer.provideMerge(BaseLive))
const BackgroundGraph = BackgroundTasksLive.pipe(Layer.provideMerge(QueueGraph))
const WorkflowGraph = TranscodeScanLive.pipe(Layer.provideMerge(BackgroundGraph))

const CallbackRuntimeLive = Layer.effect(
  CallbackRuntime,
  Effect.gen(function* () {
    const fibers = yield* FiberSet.make()
    const runPromise = yield* FiberSet.runtimePromise(fibers)<AppRequirements>()
    return CallbackRuntime.of({ awaitEmpty: FiberSet.awaitEmpty(fibers), clear: FiberSet.clear(fibers), fibers, runPromise })
  })
)

const RuntimeGraph = CallbackRuntimeLive.pipe(Layer.provideMerge(WorkflowGraph))

const HttpLive = Layer.succeed(Http, new HttpProvider({ port: 3030 }))

const SchedulerLive = Layer.effect(
  Scheduler,
  Effect.gen(function* () {
    const runtime = yield* CallbackRuntime
    return Scheduler.of(new SchedulerProvider({ runPromise: runtime.runPromise }))
  })
)

const TelegramBotLive = Layer.effect(
  TelegramBot,
  Effect.gen(function* () {
    const client = yield* Telegram
    return TelegramBot.of(new TelegramProvider(client))
  })
)

const AppLive = Layer.mergeAll(HttpLive, SchedulerLive, TelegramBotLive).pipe(Layer.provideMerge(RuntimeGraph))

interface ShutdownResources {
  callbacks: Pick<CallbackRuntimeShape, 'awaitEmpty' | 'clear'>
  http: Pick<HttpProvider, 'stop'>
  producers: readonly Pick<WorkflowOwnerShape, 'awaitEmpty' | 'clear' | 'stopIntake'>[]
  scheduler: Pick<SchedulerProvider, 'stopAll'>
  stopTelegram: Effect.Effect<void>
  transcodeQueue: Pick<TranscodeQueueShape, 'awaitIdle' | 'stopIntake'>
}

export const shutdownRuntime = ({ callbacks, http, producers, scheduler, stopTelegram, transcodeQueue }: ShutdownResources) =>
  Effect.gen(function* () {
    yield* Effect.logInfo('Shutting down gracefully...')
    yield* Effect.sync(() => scheduler.stopAll())
    const httpStop = yield* Effect.forkChild(http.stop)
    yield* stopTelegram
    yield* Effect.all([...producers.map((producer) => producer.stopIntake), transcodeQueue.stopIntake], { discard: true })

    const workCompleted = Effect.all([callbacks.awaitEmpty, transcodeQueue.awaitIdle, ...producers.map((producer) => producer.awaitEmpty)], {
      discard: true,
    })
    const completed = yield* workCompleted.pipe(Effect.timeoutOption(30_000))

    if (Option.isNone(completed)) {
      yield* Effect.all([callbacks.clear, ...producers.map((producer) => producer.clear)], { discard: true })
    }
    const httpStopExit = yield* Effect.exit(Fiber.join(httpStop))
    if (isExitFailure(httpStopExit)) {
      yield* Effect.logError(httpStopExit.cause, 'HTTP shutdown')
    }
  })

export const program = Effect.gen(function* () {
  const http = yield* Http
  const scheduler = yield* Scheduler
  const telegram = yield* TelegramBot
  const callbacks = yield* CallbackRuntime
  const backgroundTasks = yield* BackgroundTasks
  const authenticationTasks = yield* TraktAuthenticationTasks
  const transcodeQueue = yield* TranscodeQueue
  const transcodeScan = yield* TranscodeScan
  const producers = [backgroundTasks, authenticationTasks, transcodeScan]
  const telegramFibers = yield* FiberSet.make()

  yield* Effect.addFinalizer(() =>
    shutdownRuntime({
      callbacks,
      http,
      producers,
      scheduler,
      stopTelegram: FiberSet.clear(telegramFibers),
      transcodeQueue,
    })
  )

  registerFeatures(features, { http, scheduler, telegram })
  yield* http.start
  yield* FiberSet.run(telegramFibers, telegram.poll)
  return yield* Effect.never
  // oxlint-disable-next-line effecttsgo/strict-effect-provide -- application entry point
}).pipe(Effect.provide(AppLive), Effect.scoped, Effect.provide(LoggerLive))
