import { Context, Effect, FiberMap, Layer, Ref, Semaphore } from 'effect'

interface TraktAuthenticationTasksShape {
  readonly awaitEmpty: Effect.Effect<void>
  readonly clear: Effect.Effect<void>
  readonly isRunning: (chatId: number) => Effect.Effect<boolean>
  readonly start: (chatId: number, task: Effect.Effect<void, Error>) => Effect.Effect<boolean>
  readonly stopIntake: Effect.Effect<void>
}

export class TraktAuthenticationTasks extends Context.Service<TraktAuthenticationTasks, TraktAuthenticationTasksShape>()(
  'autoscan/features/trakt_sync/services/authentication.service/TraktAuthenticationTasks'
) {}

export const TraktAuthenticationTasksLive = Layer.effect(
  TraktAuthenticationTasks,
  Effect.gen(function* () {
    const tasks = yield* FiberMap.make<number, void, Error>()
    const accepting = yield* Ref.make(true)
    const admission = yield* Semaphore.make(1)
    return TraktAuthenticationTasks.of({
      awaitEmpty: Effect.ignore(FiberMap.awaitEmpty(tasks)),
      clear: FiberMap.clear(tasks),
      isRunning: (chatId) => FiberMap.has(tasks, chatId),
      start: (chatId, task) =>
        admission.withPermits(1)(
          Effect.gen(function* () {
            if (!(yield* Ref.get(accepting)) || FiberMap.hasUnsafe(tasks, chatId)) {
              return false
            }
            yield* FiberMap.run(tasks, chatId, task, { onlyIfMissing: true })
            return true
          })
        ),
      stopIntake: admission.withPermits(1)(Ref.set(accepting, false)),
    })
  })
)
