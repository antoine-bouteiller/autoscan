import { Context, Effect, FiberMap, Layer, Ref } from 'effect'

interface TraktAuthenticationTasksShape {
  readonly awaitEmpty: Effect.Effect<void>
  readonly clear: Effect.Effect<void>
  readonly isRunning: (chatId: number) => Effect.Effect<boolean>
  readonly start: <Error>(chatId: number, task: Effect.Effect<void, Error>) => Effect.Effect<boolean>
  readonly stopIntake: Effect.Effect<void>
}

export class TraktAuthenticationTasks extends Context.Service<TraktAuthenticationTasks, TraktAuthenticationTasksShape>()(
  'TraktAuthenticationTasks'
) {}

export const TraktAuthenticationTasksLive = Layer.effect(
  TraktAuthenticationTasks,
  Effect.gen(function* () {
    const tasks = yield* FiberMap.make<number>()
    const run = yield* FiberMap.runtime(tasks)()
    const accepting = yield* Ref.make(true)
    return TraktAuthenticationTasks.of({
      awaitEmpty: Effect.ignore(FiberMap.awaitEmpty(tasks)),
      clear: FiberMap.clear(tasks),
      isRunning: (chatId) => FiberMap.has(tasks, chatId),
      start: (chatId, task) =>
        Ref.get(accepting).pipe(
          Effect.map((isAccepting) => {
            if (!isAccepting || FiberMap.hasUnsafe(tasks, chatId)) {
              return false
            }
            run(chatId, task, { onlyIfMissing: true })
            return true
          })
        ),
      stopIntake: Ref.set(accepting, false),
    })
  })
)
