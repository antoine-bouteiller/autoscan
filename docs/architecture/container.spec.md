---
title: Dependency Injection Container
version: 1.0
date_created: 2026-05-08
last_updated: 2026-05-08
tags: [architecture, di, core]
---

# Introduction

This spec describes the manual dependency injection container used by Autoscan to
wire providers, integration clients, and feature dependencies. The container lives
at `src/core/container.ts` and is bootstrapped from `src/core/bootstrap.ts`.

## 1. Purpose & Scope

- Provide a single, type-safe registry for shared services (HTTP, scheduler,
  Telegram, Trakt, Radarr, Sonarr, Plex, TMDB, Cloudflare, ffmpeg).
- Centralize construction so call sites depend on tokens, not concrete classes.
- Support test isolation through cache reset and re-registration.
- Out of scope: auto-wiring, decorators, scoped lifetimes, async factories.

## 2. Definitions

- **Token**: branded `{ key: string }` that carries a phantom `_type` for
  inference. Created via `createToken<TValue>(key)`.
- **Factory**: zero-argument synchronous function returning a `TValue`.
- **Singleton**: one instance per token per container, cached on first resolve.
- **container**: the shared `Container` instance exported from `core/container`.
- **register**: associates a token with a factory; does not instantiate.
- **resolve**: returns the cached instance, or invokes the factory and caches
  its return.

## 3. Requirements, Constraints & Guidelines

- **REQ-001**: `register(token, factory)` must store the factory keyed by
  `token.key` and overwrite any prior registration for the same key.
- **REQ-002**: `resolve(token)` must return the cached instance if present;
  otherwise invoke the factory exactly once and cache the result.
- **REQ-003**: `resolve` must throw `No factory registered for token: <key>`
  when the token has no factory.
- **REQ-004**: `reset()` must clear the instance cache without removing
  registrations.
- **REQ-005**: All registrations must live in `src/core/bootstrap.ts`. Importing
  `bootstrap` is the only supported way to wire the application graph.
- **CON-001**: No reflection, no decorators, no metadata. Type safety comes
  exclusively from the `Token<TValue>` brand.
- **CON-002**: Factories are synchronous. Async setup must happen on the
  resolved instance (e.g. `httpProvider.start()`), not inside the factory.
- **CON-003**: Singletons only. The container does not support transient or
  scoped lifetimes.
- **CON-004**: Zero runtime dependencies — the container is hand-rolled.
- **GUD-001**: Always resolve via `container.resolve(TOKENS.X)`. Never
  `new ConcreteClient(...)` outside `bootstrap.ts` or tests.
- **GUD-002**: Add new services by exporting a token in `TOKENS` and a
  registration in `bootstrap.ts`. Keep the two in lockstep.
- **PAT-001**: Factory closure pattern — the factory captures `env` / config
  at registration time and returns the instance lazily.

## 4. Interfaces & Data Contracts

```ts
interface Token<TValue> {
  readonly key: string
  readonly _type?: (value: TValue) => TValue
}

class Container {
  register<TValue>(token: Token<TValue>, factory: () => TValue): void
  resolve<TValue>(token: Token<TValue>): TValue
  reset(): void
}

export const container: Container
```

`TOKENS` exposes one token per registered service:

| Token                | Resolved type       |
| -------------------- | ------------------- |
| `HTTP_PROVIDER`      | `HttpProvider`      |
| `SCHEDULER_PROVIDER` | `SchedulerProvider` |
| `TELEGRAM_PROVIDER`  | `TelegramProvider`  |
| `TELEGRAM_CLIENT`    | `ITelegramClient`   |
| `TRAKT_CLIENT`       | `ITraktClient`      |
| `RADARR_CLIENT`      | `IRadarrClient`     |
| `SONARR_CLIENT`      | `ISonarrClient`     |
| `PLEX_CLIENT`        | `IPlexClient`       |
| `TMDB_CLIENT`        | `ITmdbClient`       |
| `CLOUDFLARE_CLIENT`  | `ICloudflareClient` |
| `FFMPEG_CLIENT`      | `FfmpegClient`      |

## 5. Acceptance Criteria

- **AC-001**: Given a token registered with factory `f`, when `resolve` is
  called twice, then `f` is invoked once and both calls return the same
  reference.
- **AC-002**: Given a token with no factory, when `resolve` is called, then
  it throws `Error` with the token key in the message.
- **AC-003**: Given a registered and resolved token, when `reset()` is called,
  then the next `resolve` invokes the factory again.
- **AC-004**: `container.resolve(TOKENS.HTTP_PROVIDER)` is statically typed as
  `HttpProvider` without casts at the call site.

## 6. Test Automation Strategy

- Call `container.reset()` in a `beforeEach` to drop cached singletons between
  tests while keeping production registrations intact.
- Mock a dependency by re-registering its token with a stub factory before
  the system under test resolves it: `container.register(TOKENS.X, () => fake)`.
- Avoid importing `core/bootstrap` from unit tests; register only the tokens
  the test actually needs.
- The container itself is covered by direct unit tests in
  `src/core/container.test.ts` (resolution, caching, error path, reset).

## 7. Rationale & Context

A library like inversify or tsyringe would add ~50 KB, decorators, and
`reflect-metadata` for an application with roughly a dozen wired services and
no plugin surface. The hand-rolled 70-line container keeps the bundle small,
avoids decorator/metadata configuration, and makes the dependency graph fully
explicit — every edge appears as a literal `container.register(...)` call in
`bootstrap.ts`. The phantom-typed `Token<TValue>` recovers most of the
ergonomics of a typed DI library without runtime cost.

## 8. Dependencies & External Integrations

None. The container has zero runtime dependencies and is implemented entirely
with built-in `Map`.

## 9. Examples & Edge Cases

Registering and resolving:

```ts
container.register(TOKENS.HTTP_PROVIDER, () => new HttpProvider({ port: 3030 }))
const http = container.resolve(TOKENS.HTTP_PROVIDER) // typed as HttpProvider
```

Mocking in tests:

```ts
beforeEach(() => {
  container.reset()
  container.register(TOKENS.RADARR_CLIENT, () => fakeRadarr)
})
```

Unregistered token:

```ts
container.resolve(TOKENS.PLEX_CLIENT)
// Error: No factory registered for token: plexClient
```

Async startup belongs on the resolved instance, not in the factory:

```ts
const http = container.resolve(TOKENS.HTTP_PROVIDER)
await http.start()
```

## 10. Validation Criteria

- `bun run check` and `bun run test` pass.
- No file outside `src/core/bootstrap.ts` and tests instantiates a registered
  provider or client directly.
- Every key in `TOKENS` has a matching `container.register` call in
  `bootstrap.ts`.
- New services follow the token + bootstrap registration pattern.

## 11. Related Specifications / Further Reading

- ../project_structure.spec.md
- feature_registration.spec.md
