import { type SQL } from 'bun'
import { type BunSQLDatabase } from 'drizzle-orm/bun-sql/postgres'
import { Context, Effect, FiberSet, Layer, type Option, Ref } from 'effect'

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

export class Database extends Context.Service<Database, { readonly db: BunSQLDatabase; readonly sql: SQL }>()('Database') {}
export class Telegram extends Context.Service<Telegram, ITelegramClient>()('Telegram') {}
export class Trakt extends Context.Service<Trakt, ITraktClient>()('Trakt') {}
export class Plex extends Context.Service<Plex, IPlexClient>()('Plex') {}
export class Tmdb extends Context.Service<Tmdb, ITmdbClient>()('Tmdb') {}
export class Radarr extends Context.Service<Radarr, IRadarrClient>()('Radarr') {}
export class Sonarr extends Context.Service<Sonarr, ISonarrClient>()('Sonarr') {}
export class Ffmpeg extends Context.Service<Ffmpeg, IFfmpegClient>()('Ffmpeg') {}
export class Http extends Context.Service<Http, HttpProvider>()('Http') {}
export class Scheduler extends Context.Service<Scheduler, SchedulerProvider>()('Scheduler') {}
export class TelegramBot extends Context.Service<TelegramBot, TelegramProvider>()('TelegramBot') {}

export interface TranscodeQueueShape {
  readonly awaitIdle: Effect.Effect<void>
  readonly enqueue: (job: TranscodeJob) => Effect.Effect<boolean>
  readonly status: Effect.Effect<{ currentJob?: TranscodeJob; isProcessing: boolean; queueLength: number }>
  readonly stopIntake: Effect.Effect<void>
}

export class TranscodeQueue extends Context.Service<TranscodeQueue, TranscodeQueueShape>()('TranscodeQueue') {}

export type WorkflowRequirements = Database | Ffmpeg | Plex | Radarr | Sonarr | Telegram | Tmdb | Trakt | TraktAuthenticationTasks | TranscodeQueue

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
  readonly start: <Error>(effect: Effect.Effect<void, Error, WorkflowRequirements>) => Effect.Effect<boolean>
}

export class TranscodeScan extends Context.Service<TranscodeScan, TranscodeScanShape>()('TranscodeScan') {}

export interface BackgroundTasksShape extends WorkflowOwnerShape {
  readonly start: <Success, Error>(effect: Effect.Effect<Success, Error, WorkflowRequirements>) => Effect.Effect<boolean>
}

export class BackgroundTasks extends Context.Service<BackgroundTasks, BackgroundTasksShape>()('BackgroundTasks') {}

export const BackgroundTasksLive = Layer.effect(
  BackgroundTasks,
  Effect.gen(function* () {
    const fibers = yield* FiberSet.make()
    const runFork = yield* FiberSet.runtime(fibers)<WorkflowRequirements>()
    const accepting = yield* Ref.make(true)
    return BackgroundTasks.of({
      awaitEmpty: FiberSet.awaitEmpty(fibers),
      clear: FiberSet.clear(fibers),
      start: (effect) =>
        Ref.get(accepting).pipe(
          Effect.map((isAccepting) => {
            if (isAccepting) {
              runFork(effect)
            }
            return isAccepting
          })
        ),
      stopIntake: Ref.set(accepting, false),
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

export class CallbackRuntime extends Context.Service<CallbackRuntime, CallbackRuntimeShape>()('CallbackRuntime') {}
