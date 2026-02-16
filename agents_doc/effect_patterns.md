# Effect-TS Patterns

## Service Definition

Services use `Effect.Service` with `accessors: true` and declare dependencies inline:

```typescript
export class MyService extends Effect.Service<MyService>()('MyService', {
  accessors: true,
  dependencies: [DepA.Default, DepB.Default],
  effect: Effect.gen(function* () {
    const depA = yield* DepA
    const depB = yield* DepB

    const doSomething = Effect.fn('MyService.doSomething')(function* (arg: string) {
      // implementation
    })

    return { doSomething }
  }),
}) {}

export const MyServiceLive = MyService.Default
```

- Use `Effect.fn('Service.method')` for all methods (enables tracing)
- Use `sync: () => ({...})` for synchronous-only services (e.g. `FfmpegClient`)

## Error Handling

Errors are defined in `src/errors.ts` using `Schema.TaggedError`:

```typescript
export class NetworkError extends Schema.TaggedError<NetworkError>()('NetworkError', {
  message: Schema.String,
  status: Schema.optional(Schema.Number),
}) {}
```

Handle errors with `Effect.catchTag` or `Effect.catchTags`:

```typescript
yield* someEffect.pipe(
  Effect.catchTag('NetworkError', (e) => Effect.logWarning(e.message)),
  Effect.catchTags({
    ValidationError: () => Effect.succeed(fallback),
    FileNotFoundError: () => Effect.fail(new CustomError({...})),
  }),
)
```

## Configuration

`AppConfig` loads from env via `Config.*` APIs:

```typescript
Config.string('KEY')              // required string
Config.number('KEY')              // required number
Config.redacted('KEY')            // sensitive (Redacted<string>)
Config.withDefault('fallback')    // default value
```

Unwrap redacted: `Redacted.value(config.SECRET_TOKEN)`

## HTTP Client

Use `makeHttpClient(client, baseUrl, headers)` from `src/config/http_client.ts`. Returns typed helpers:

```typescript
const api = makeHttpClient(client, config.PLEX_URL, {
  'X-Plex-Token': Redacted.value(config.PLEX_TOKEN),
})

const data = yield* api.get('/path', ResponseSchema)
const _    = yield* api.post('/path', body)
```

## Schemas

Use `Schema.Struct`, `Schema.Union`, `Schema.Literal`, `Schema.optional`, `Schema.transform`:

```typescript
export const MySchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  status: Schema.optional(Schema.Literal('active', 'inactive')),
  key: Schema.transform(Schema.String, Schema.Number, {
    decode: Number,
    encode: String,
  }),
})
export type MySchema = typeof MySchema.Type
```

## Scheduling

Jobs use `Effect.schedule` with `Schedule.cron`:

```typescript
yield* Effect.fork(
  Effect.schedule(
    job.pipe(Effect.catchAll((e) => Effect.logError(String(e)))),
    Schedule.cron('0 */10 * * * *', 'Europe/Paris')
  )
)
```

Job files in `src/jobs/` export pure `Effect.Effect` programs.

## Database

- `DatabaseService` wraps Drizzle ORM over SQLite (Bun)
- `MediaRepository` wraps queries in `Effect.promise(() => db.query(...))`

## Concurrency

- `Effect.fork` / `Effect.forkDaemon` for background fibers
- `Queue.unbounded<T>()` + `Ref.make(initial)` for state (see `TranscodeService`)
- `ManagedRuntime.make(layer)` for running effects from external callbacks (see `TelegramService`)

## Logging

```typescript
yield* Effect.logInfo('message').pipe(
  Effect.annotateLogs({ context: 'ServiceName', key: value })
)
```
