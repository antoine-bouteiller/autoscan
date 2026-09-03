---
title: Plex Authentication
status: review
author: Antoine Bouteiller
date: 2026-09-03
related:
  - docs/project_structure.spec.md
  - src/features/trakt_sync/trakt_sync.spec.md
  - src/providers/telegram/telegram.spec.md
---

## 2. Problem Statement

Every Plex call the service makes — metadata reads, section refreshes, stream selection — is authorized by a Plex account token. That token is operator-obtained out of band, injected as deployment configuration, and silently useless once it is revoked or rotated: recovering means editing a secret file and restarting the service. Plex authorization instead happens through the same Telegram device-link conversation already used for Trakt, so the operator links the account from their phone and the service persists and reuses the resulting token.

- `[G-1]` Obtain a Plex account token through a Telegram-driven PIN link flow.
- `[G-2]` Persist one Plex token and serve it to every Plex request without a restart.
- `[G-3]` Let the operator re-link at any time when the stored token is missing or rejected.
- `[G-4]` Keep Plex credentials out of deployment configuration.

## 3. Key Design Decisions

| Decision                   | Choice                                                                                                                               | Rationale                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[KD-1]` Credential source | The Plex token lives in one database row; `PLEX_URL` remains the only Plex configuration value.                                      | A credential the operator can replace at runtime cannot be a startup-time constant, and the database already carries the equivalent Trakt tokens.                                          |
| `[KD-2]` Token resolution  | `PlexClient` receives a token-resolving `Effect` and attaches `X-Plex-Token` per request instead of at construction.                 | The client outlives any single token, so late binding is what makes a re-link take effect without rebuilding the layer graph.                                                              |
| `[KD-3]` Cache             | A `Ref` in the token store caches the row; a successful link overwrites it, an unauthorized response clears it.                      | Plex calls fan out per library section, so a per-request database round trip is wasted work, while explicit invalidation keeps the cache from serving a dead token.                        |
| `[KD-4]` Link protocol     | Plex PIN flow: create a strong PIN on `plex.tv`, send the operator a `app.plex.tv/auth` link, poll the PIN until it carries a token. | It is Plex's device-link equivalent of Trakt's device code, so the operator experience and the polling task shape stay identical (`src/features/trakt_sync/commands/trakt.command.ts:44`). |
| `[KD-5]` Client identity   | A random client identifier is generated per link attempt and stored with the token.                                                  | `plex.tv` binds a PIN and its resulting token to the identifier that created it, so it must be stable across the poll loop and recorded with the token it produced.                        |
| `[KD-6]` Link surface      | `plex.tv` PIN endpoints are methods on `PlexClient`, backed by a second internal HTTP client for the `plex.tv` base URL.             | One Plex integration service keeps runtime wiring unchanged, mirroring `TraktClient`, which serves both OAuth and sync from one class (`src/integrations/trakt/trakt.service.ts:66`).      |
| `[KD-7]` Polling admission | Link polling runs in one keyed scoped task per chat, shared with the Trakt authorization flow.                                       | Both flows need the same "one live poll per chat, cancelled at shutdown" guarantee, and a keyed runner satisfies both without a second copy.                                               |

## 4. Principles & Intents

- `[PI-1]` Runtime credential — the Plex token is application state, not configuration; nothing reads it from the environment.
- `[PI-2]` Explicit unauthenticated state — a missing or rejected token is a named, typed failure, never an empty result or a generic HTTP error.
- `[PI-3]` One live link — a chat can have at most one PIN poll in flight, and it never outlives the runtime scope.
- `[PI-4]` No secret in a message — Telegram receives the link URL and PIN code, never the resulting token.

## 5. Non-Goals

- `[NG-1]` Multiple Plex accounts, servers, or per-user tokens.
- `[NG-2]` Automatic re-linking; recovering from a revoked token is an operator action.
- `[NG-3]` Server discovery through `plex.tv`; the server address stays `PLEX_URL`.
- `[NG-4]` Managed Plex Home users, PIN-protected profiles, or scoped server tokens.
- `[NG-5]` Proactive alerting on the unauthenticated state; an unauthenticated failure is logged like any other and the operator acts on it.

## 6. Caveats

- `[C-1]` Plex-dependent work started before the first link fails with `PlexUnauthenticatedError` and is logged by its job, webhook, or command handler; the operator links, and the next scheduled or webhook-driven run succeeds.
- `[C-2]` A Plex PIN expires (roughly 15 minutes for a strong PIN); the poll ends at the expiry the PIN response reports and the operator is told to retry.
- `[C-3]` The stored token is an account token with the account's full Plex authority; it is stored unencrypted, exactly as the Trakt tokens are.
- `[C-4]` The `plex.tv` PIN endpoints are unversioned public API; a shape change surfaces as a validation failure on the link command, not on media traffic.

## 7. High-Level Components

```text
Telegram /plex ──▶ plex auth command ──▶ PlexClient.createPin ──▶ plex.tv
                          │                      ▲
                          │ poll task            │ PlexClient.checkPin
                          ▼                      │
                   PlexTokenStore ◀── upsert ── plex auth repository ──▶ plex_tokens
                          │ get
                          ▼
   language sync / transcoding / trakt sync ──▶ PlexClient ──▶ Plex Media Server
```

| Component            | Module type        | Responsibility                                                 | Public API surface                     |
| -------------------- | ------------------ | -------------------------------------------------------------- | -------------------------------------- |
| Plex client          | Integration client | Attach the current token to media calls; create and poll PINs  | `IPlexClient`, `PlexClient`            |
| Plex token store     | Effect service     | Resolve, cache, replace, and invalidate the active token       | `PlexTokenStore`, `PlexTokenStoreLive` |
| Plex auth repository | Database Effects   | Read and upsert the single credential row                      | `getPlexToken`, `upsertPlexToken`      |
| Plex auth command    | Telegram command   | Drive the link conversation and the PIN poll                   | `/plex`                                |
| Authentication tasks | Scoped service     | Serialize one authorization poll per chat across features      | `AuthenticationTasks`                  |
| Runtime wiring       | Layers and config  | Build the Plex client from the store; keep Plex out of the env | `ClientsLive`, `envConfig`, `features` |

## 8. Detailed Design

### 8.1 Plex auth repository

`plex_tokens` holds at most one row: a serial `id`, `auth_token`, `client_identifier`, and `linked_at`. `getPlexToken` returns the first row or `undefined`; `upsertPlexToken` inserts when the table is empty and otherwise overwrites the existing row, matching the Trakt token repository's single-row discipline (`src/features/trakt_sync/repositories/trakt.repository.ts:12`). Both fail with `DatabaseQueryError`. A drizzle migration under `migrations/` creates the table; dropping it is the rollback boundary and forces a re-link.

### 8.2 Plex token store

The store owns the token's in-memory lifecycle and is the only reader of the repository on the hot path.

```ts
interface PlexTokenStoreService {
  readonly get: Effect.Effect<string, PlexUnauthenticatedError | DatabaseQueryError, Database>
  readonly invalidate: Effect.Effect<void>
  readonly set: (token: string, clientIdentifier: string) => Effect.Effect<void, DatabaseQueryError, Database>
}
```

`get` returns the cached token; on a miss it loads the row, caches it, and fails with `PlexUnauthenticatedError` when no row exists. `set` writes the row, then caches the token, so a crash between the two cannot leave a cached token that is not persisted. `invalidate` clears the cache only, forcing the next `get` to reload — the row stays, because a `401` is as likely to be a transient Plex outage as a revocation. Concurrent `get` calls during a miss are serialized by a semaphore so a burst of section refreshes issues one query.

### 8.3 Plex client

`PlexClient` keeps its media methods and gains the two link methods. Its config takes a token effect rather than a string:

```ts
interface PlexClientConfig {
  clientIdentifier: Effect.Effect<string>
  token: Effect.Effect<string, PlexUnauthenticatedError | DatabaseQueryError, Database>
  transport: EffectHttpClient.HttpClient
  url: string
}
```

Every media method resolves the token first and passes it as a per-request header:

```ts
getSections = this.authorized((token) =>
  this.client.get('library/sections', { headers: { 'X-Plex-Token': token }, validator: plexResponseValidator })
)
```

so each media signature gains `PlexUnauthenticatedError | DatabaseQueryError` in its error channel and `Database` in its requirements. A media response with status `401` maps to `PlexUnauthenticatedError` after invalidating the cache; every other failure keeps its existing `HttpClientError` shape and retry behavior.

The link methods talk to `https://plex.tv/api/v2` with `X-Plex-Product: Autoscan` and the per-attempt `X-Plex-Client-Identifier`, and carry no `X-Plex-Token`:

```ts
readonly createPin: (clientIdentifier: string) => Effect.Effect<PlexPin, HttpClientError>
readonly checkPin: (id: number, clientIdentifier: string) => Effect.Effect<string | undefined, HttpClientError>
```

`createPin` posts `pins?strong=true` and validates `{ id: number, code: string, expiresIn: number }`. `checkPin` gets `pins/{id}` and returns the `authToken` when Plex has populated it, `undefined` while it is still null, and retries are disabled so a slow poll does not stack requests. `verifyToken` gets `user` on `plex.tv` with the candidate token and answers whether Plex still accepts it — `401` and `403` are a negative answer, not a failure.

### 8.4 Plex auth command

`/plex` follows the Trakt authorization command step for step.

```text
/plex ─▶ stored token? ─yes─▶ verifyToken ─valid─▶ "Already authenticated."
   │                                 └─invalid─┐
   └─no──────────────────────────────────────┬─┘
                                             ▼
                        poll already running for chat? ─yes─▶ "Plex link already in progress."
                                             │no
                                             ▼
                              createPin ─fail─▶ log + "Failed to start Plex authentication."
                                             │
                                             ▼
        send link + code, then poll checkPin every 5s until a token or expiresIn elapses
                                             │
                          token ─▶ store.set ─▶ "Plex authentication successful!"
                        expiry/error ─▶ log + "Plex authentication failed or timed out."
```

The link message carries the PIN code and the authorization URL built from the attempt's identifier:

```ts
const url = `https://app.plex.tv/auth#?clientID=${clientIdentifier}&code=${pin.code}&context%5Bdevice%5D%5Bproduct%5D=Autoscan`
```

The client identifier is a UUID drawn once per attempt from `Crypto` and used for `createPin`, every `checkPin`, and the stored row. The poll effect is submitted to the shared authentication tasks keyed by feature and chat, and it captures `Database` from the command's context exactly as the Trakt poll does (`src/features/trakt_sync/commands/trakt.command.ts:74`), so the detached fiber keeps a working database handle. Interruption at shutdown is silent; any other cause is logged and reported to the chat once. The command always returns `{ step: 'idle' }`.

### 8.5 Authentication tasks

The keyed task runner is a runtime-level service used by both authorization flows:

```ts
interface AuthenticationTasksService {
  readonly awaitEmpty: Effect.Effect<void>
  readonly clear: Effect.Effect<void>
  readonly isRunning: (key: string) => Effect.Effect<boolean>
  readonly start: (key: string, task: Effect.Effect<void, Error>) => Effect.Effect<boolean>
  readonly stopIntake: Effect.Effect<void>
}
```

Keys are namespaced by feature (`plex:${chatId}`, `trakt:${chatId}`) so the two flows can run concurrently in one chat while each stays single-flighted. `start` returns `false` when intake is closed or the key is busy; admission is guarded by a semaphore, and the service participates in graceful shutdown as one of the runtime's workflow producers.

### 8.6 Runtime wiring and configuration

`envConfig` carries `PLEX_URL` and no Plex secret; `PLEX_TOKEN` is absent from the environment schema, from the file-secret key list (`src/config/env.ts:3`), from the Nix module options, and from the deployment documentation. The `Plex` layer builds the client from the token store:

```ts
Layer.effect(
  Plex,
  Effect.gen(function* () {
    const env = yield* Env
    const store = yield* PlexTokenStore
    const transport = yield* HttpClient.HttpClient
    return new PlexClient({ clientIdentifier: Crypto.randomUuid, token: store.get, transport, url: env.PLEX_URL })
  })
)
```

`PlexTokenStoreLive` sits in the base layer graph beside the database, and the `plex_auth` feature is registered in `src/features/index.ts` so `/plex` is available. `AppRequirements` gains `PlexTokenStore` and the shared `AuthenticationTasks` service replaces the Trakt-specific one in the producer list drained at shutdown (`src/core/bootstrap.ts:176`).

Because media calls now require `Database`, the Plex-dependent jobs, webhooks, and services propagate that requirement; it is already part of `AppRequirements`, so no handler signature changes beyond the widened error channel.

## 9. Open Questions

N/A
