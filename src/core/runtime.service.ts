import { type SQL } from 'bun'
import { type BunSQLDatabase } from 'drizzle-orm/bun-sql/postgres'
import { Context, Effect, FiberSet, type FileSystem, Layer, type Option, Ref, Semaphore } from 'effect'
import { type ChildProcessSpawner } from 'effect/unstable/process'

import { type TraktAuthenticationTasks } from '@/features/trakt_sync/services/authentication.service'
import { type TranscodeJob } from '@/features/transcoding/types'
import { type IRadarrClient } from '@/integrations/arr/radarr.service'
import { type ISonarrClient } from '@/integrations/arr/sonarr.service'
import { type IFfmpegClient } from '@/integrations/ffmpeg/ffmpeg.service'
import { type IPlexClient } from '@/integrations/plex/plex.service'
import { type ITelegramClient } from '@/integrations/telegram/telegram.service'
import { type ITmdbClient } from '@/integrations/tmdb/tmdb.service'
import { type ITraktClient } from '@/integrations/trakt/trakt.service'
import { type HttpProvider } from '@/providers/http/http.provider'
import { type SchedulerProvider } from '@/providers/scheduler/scheduler.provider'
import { type TelegramProvider } from '@/providers/telegram/telegram.provider'

export class Database extends Context.Service<Database, { readonly db: BunSQLDatabase; readonly sql: SQL }>()(
  'autoscan/core/runtime.service/Database'
) {}
export class Telegram extends Context.Service<Telegram, ITelegramClient>()('autoscan/core/runtime.service/Telegram') {}
export class Trakt extends Context.Service<Trakt, ITraktClient>()('autoscan/core/runtime.service/Trakt') {}
export class Plex extends Context.Service<Plex, IPlexClient>()('autoscan/core/runtime.service/Plex') {}
export class Tmdb extends Context.Service<Tmdb, ITmdbClient>()('autoscan/core/runtime.service/Tmdb') {}
export class Radarr extends Context.Service<Radarr, IRadarrClient>()('autoscan/core/runtime.service/Radarr') {}
export class Sonarr extends Context.Service<Sonarr, ISonarrClient>()('autoscan/core/runtime.service/Sonarr') {}
export class Ffmpeg extends Context.Service<Ffmpeg, IFfmpegClient>()('autoscan/core/runtime.service/Ffmpeg') {}
export class Http extends Context.Service<Http, HttpProvider>()('autoscan/core/runtime.service/Http') {}
export class Scheduler extends Context.Service<Scheduler, SchedulerProvider>()('autoscan/core/runtime.service/Scheduler') {}
export class TelegramBot extends Context.Service<TelegramBot, TelegramProvider>()('autoscan/core/runtime.service/TelegramBot') {}

export interface TranscodeQueueShape {
  readonly awaitIdle: Effect.Effect<void>
  readonly enqueue: (job: TranscodeJob) => Effect.Effect<boolean>
  readonly status: Effect.Effect<{ currentJob?: TranscodeJob; isProcessing: boolean; queueLength: number }>
  readonly stopIntake: Effect.Effect<void>
}

export class TranscodeQueue extends Context.Service<TranscodeQueue, TranscodeQueueShape>()('autoscan/core/runtime.service/TranscodeQueue') {}

type WorkflowRequirements =
  | ChildProcessSpawner.ChildProcessSpawner
  | Database
  | Ffmpeg
  | FileSystem.FileSystem
  | Plex
  | Radarr
  | Sonarr
  | Telegram
  | Tmdb
  | Trakt
  | TraktAuthenticationTasks
  | TranscodeQueue

export interface WorkflowOwnerShape {
  readonly awaitEmpty: Effect.Effect<void>
  readonly clear: Effect.Effect<void>
  readonly stopIntake: Effect.Effect<void>
}

export interface TranscodeScanShape extends WorkflowOwnerShape {
  readonly isRunning: Effect.Effect<boolean>
  readonly run: <Success, Error, Requirements>(
    effect: Effect.Effect<Success, Error, Requirements>
  ) => Effect.Effect<Option.Option<Success>, Error, Requirements>
  readonly start: <Error, Requirements extends WorkflowRequirements>(
    effect: Effect.Effect<void, Error, Requirements>
  ) => Effect.Effect<boolean, never, Requirements>
}

export class TranscodeScan extends Context.Service<TranscodeScan, TranscodeScanShape>()('autoscan/core/runtime.service/TranscodeScan') {}

export interface BackgroundTasksShape extends WorkflowOwnerShape {
  readonly start: <Success, Error, Requirements extends WorkflowRequirements>(
    effect: Effect.Effect<Success, Error, Requirements>
  ) => Effect.Effect<boolean, never, Requirements>
}

export class BackgroundTasks extends Context.Service<BackgroundTasks, BackgroundTasksShape>()('autoscan/core/runtime.service/BackgroundTasks') {}

export const BackgroundTasksLive = Layer.effect(
  BackgroundTasks,
  Effect.gen(function* () {
    const fibers = yield* FiberSet.make()
    const accepting = yield* Ref.make(true)
    const admission = yield* Semaphore.make(1)
    return BackgroundTasks.of({
      awaitEmpty: FiberSet.awaitEmpty(fibers),
      clear: FiberSet.clear(fibers),
      start: (effect) =>
        admission.withPermits(1)(
          Effect.gen(function* () {
            if (!(yield* Ref.get(accepting))) {
              return false
            }
            yield* FiberSet.run(fibers, effect)
            return true
          })
        ),
      stopIntake: admission.withPermits(1)(Ref.set(accepting, false)),
    })
  })
)

export type AppRequirements = BackgroundTasks | TranscodeScan | WorkflowRequirements

export interface CallbackRuntimeShape {
  readonly awaitEmpty: Effect.Effect<void>
  readonly clear: Effect.Effect<void>
  readonly fibers: FiberSet.FiberSet
  readonly runPromise: <Success, Error>(effect: Effect.Effect<Success, Error, AppRequirements>) => Promise<Success>
}

export class CallbackRuntime extends Context.Service<CallbackRuntime, CallbackRuntimeShape>()('autoscan/core/runtime.service/CallbackRuntime') {}
