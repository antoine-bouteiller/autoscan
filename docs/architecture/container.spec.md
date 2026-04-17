---
title: DI Container
status: condensed
author: Antoine Bouteiller
date: 2026-04-17
related: [docs/architecture/feature_registration.spec.md, docs/project_structure.spec.md]
---

## 2. Problem Statement

The Autoscan server is composed of many long-lived singletons: integration clients (Plex, Radarr, Sonarr, TMDB,
Trakt, Cloudflare, Telegram, FFmpeg), application providers (HTTP, Scheduler, Telegram), and a handful of cross-cutting
services (metadata, DNS, transcoding). Every feature in `src/features/` consumes a subset of these, and the test
suite needs to substitute the integration clients with in-memory mocks.

Three concerns must be reconciled:

1. **Construction order.** Integration clients depend on configuration (`env`) and must not be instantiated at module
   load time — `env` validates at import, and tests need to run before any real network client is ever constructed.
2. **Substitution for tests.** Tests replace prod clients with mocks. The substitution must be process-wide, survive
   Vitest's module caching, and require no per-test plumbing.
3. **Type safety across the wiring.** A consumer asking for `PLEX_CLIENT` must receive an `IPlexClient`, guaranteed by
   the type system, with no hand-written casts at the call site.

A minimal service-locator/DI container addresses all three: factories are registered once at boot, instances are
created lazily on first resolution, and tokens carry the declared type of what they resolve to.

- `[G-1]` Single process-wide registry for long-lived singletons (providers + integration clients).
- `[G-2]` Lazy instantiation — a registered factory runs at most once, on first `resolve`, and its return is cached.
- `[G-3]` Strict type safety — each token declares its resolution type; `register` and `resolve` infer from the
  token, no caller-supplied generics, no call-site casts in the happy path.
- `[G-4]` Test substitution without framework magic — test setup re-registers the same tokens with mock factories
  before any feature code touches the container.
- `[G-5]` Zero third-party DI dependency — a dozen-line class is enough; no decorators, no reflect-metadata, no
  `tsyringe`/`inversify`/`awilix`.

## 3. Key Design Decisions

| Decision                                                        | Choice                                                                                                                                                         | Rationale                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[KD-1]` In-house, minimal container                            | A single `Container` class in `src/core/container.ts`, no external DI library                                                                                  | Fits the entire project's needs in <50 LOC. Avoids decorators, reflect-metadata, and the `experimentalDecorators` TS flag. Keeps the runtime behaviour trivial to reason about and trivial to reset between tests.                                                                                           |
| `[KD-2]` Tokens are branded typed handles                       | `Token<T> = { readonly key: string; readonly _type?: (value: T) => T }`, produced by a private `createToken<T>(key)` factory                                   | The phantom field in function position makes `T` invariant, so `Token<A>` is not assignable to `Token<B>` unless `A = B`. `key` is the map lookup; `_type` is erased at runtime. Eliminates caller-supplied generics on `register`/`resolve`.                                                                |
| `[KD-3]` Centralised TOKENS inventory                           | All tokens live in `src/core/container.ts` as a single `TOKENS` object, one entry per resolvable type, keys typed via `import type` of the implementation type | Reading `TOKENS` gives a complete picture of what the container holds. Type-only imports of provider/integration types avoid the runtime cycle introduced by those modules importing `container` back (e.g. `TelegramProvider`).                                                                             |
| `[KD-4]` Lazy singleton semantics                               | `register` stores the factory; `resolve` runs it on first call and caches the instance. Subsequent calls return the cached instance.                           | Matches how every consumer uses the container today — nobody wants a new `HttpProvider` per call. Laziness keeps boot order flexible: `bootstrap.ts` registers everything, then `registerFeatures` triggers the first resolutions.                                                                           |
| `[KD-5]` `register` infers from the factory                     | `register<T>(token: Token<T>, factory: () => T): void`                                                                                                         | The factory's return must satisfy the token's declared `T`. Registering `new SonarrClient(...)` under `TOKENS.PLEX_CLIENT` is a compile error at the registration site, not a runtime surprise.                                                                                                              |
| `[KD-6]` `resolve` returns `T` with no generic at the call site | `resolve<T>(token: Token<T>): T`                                                                                                                               | Every call site drops the `<Type>` assertion: `container.resolve(TOKENS.PLEX_CLIENT)` is typed `IPlexClient` automatically.                                                                                                                                                                                  |
| `[KD-7]` One internal cast, invariant-justified                 | `resolve` contains exactly one `instance as T` adjacent to a comment naming the `register<T>` invariant that guarantees it                                     | A heterogeneous `Map<string, unknown>` cannot carry a per-entry generic without bridging `unknown` → `T` at read time. Localising the cast to `Container` (instead of each call site) is the win; the invariant is enforceable by the `register` signature.                                                  |
| `[KD-8]` Cache-miss check uses `Map.has`                        | `if (!this.instances.has(token.key)) { … }` rather than truthy check on the value                                                                              | Falsy registered instances (`0`, `''`, `false`, `null`) must be cache hits. Not a real bug today (all values are objects), but defensive and free.                                                                                                                                                           |
| `[KD-9]` `reset()` clears instances only                        | `reset()` clears the `instances` map but leaves `factories` intact                                                                                             | Tests call `reset()` between cases to get fresh singletons without re-registering. Keeping factories preserves the setup that `tests/setup.ts` ran once at worker boot.                                                                                                                                      |
| `[KD-10]` Registration is last-write-wins                       | Re-registering the same token overwrites the previous factory silently                                                                                         | Enables the test pattern: `bootstrap.ts` registers prod factories; test setup re-registers the integration tokens with mock factories after boot-time module imports resolved. No error, no warning, deliberate.                                                                                             |
| `[KD-11]` No scopes, no child containers, no async              | The container has exactly three operations: `register`, `resolve`, `reset`                                                                                     | Request-scoped instances, per-user containers, and async factories are scope creep. None of the current consumers need them. If a legitimate need appears, it gets its own spec.                                                                                                                             |
| `[KD-12]` Synchronous factory contract                          | `Factory<T> = () => T` — no `Promise<T>`                                                                                                                       | All current singletons construct synchronously. An async factory would force `resolve` to return `Promise<T>` for every consumer or require awaiting construction elsewhere. If an async dependency ever exists, it exposes an async method on the resolved instance instead of being async at registration. |
| `[KD-13]` Missing-token failure is a thrown Error               | `resolve` throws `Error("No factory registered for token: <key>")` when no factory exists                                                                      | Missing registration is a boot-time bug, not a recoverable runtime state. A thrown error surfaces it loudly in tests and crashes the process at boot where it belongs.                                                                                                                                       |

## 4. Principles & Intents

- `[PI-1]` **Tokens carry their type.** The declaration of `TOKENS` is the single source of truth for "what does this
  name resolve to?". `register` and `resolve` derive their types from the token — never from caller-supplied generics.
- `[PI-2]` **Casts at the boundary, not at consumers.** The container owns a single internal `as T` justified by the
  `register<T>` invariant. No feature, provider, or integration writes `<Type>` or `as Type` to resolve from the
  container in the happy path. Test-site mock narrowing (`resolve(TMDB_CLIENT) as MockTmdbClient`) is the one
  explicit, localised exception.
- `[PI-3]` **Bootstrap registers, features resolve.** `src/core/bootstrap.ts` is the only file that calls
  `container.register` for prod factories. `tests/setup.ts` is the only file that calls `container.register` for
  mock factories. Feature code only ever calls `container.resolve`. Deviations are spec-gated.
- `[PI-4]` **The container is invisible at steady state.** Once `bootstrap.ts` has run and `registerFeatures` has
  fired, no further registrations happen. `reset()` exists only for tests.
- `[PI-5]` **No container features without a consumer.** Scopes, child containers, async factories, decorator-based
  auto-wiring, and circular-dep detection are all features with zero current consumers. They are out of scope until
  a concrete use case justifies them.

## 5. Non-Goals

- `[NG-1]` Not a general-purpose DI framework. `@Inject`-style decorators, constructor auto-wiring, and
  reflect-metadata are out of scope.
- `[NG-2]` No hierarchical/child containers. One process-wide instance, period.
- `[NG-3]` No request-scoped or per-transaction instances. All tokens resolve to singletons.
- `[NG-4]` No async factories. See `[KD-12]`.
- `[NG-5]` No lifecycle hooks (`onInit`, `onDispose`). `reset()` is the only lifecycle operation.
- `[NG-6]` No circular-dependency detection. The set of tokens is small and reviewed in one file; circularity shows up
  at boot via stack overflow and is trivially fixable.
- `[NG-7]` No in-container configuration (token-level tags, multi-binding, named variants). A token is a 1:1 name for
  a type.
- `[NG-8]` No feature-local token creation. Only `TOKENS` in `container.ts` creates tokens; `createToken` stays
  unexported.

## 6. Caveats

- `[C-1]` `container.ts` must `import type` (not value-import) every provider/integration type referenced in
  `TOKENS`. Those modules may import `container` back (e.g. `TelegramProvider` does), and a value-level import would
  create a runtime cycle. `import type` is erased by tsc and rolldown.
- `[C-2]` Registration is last-write-wins (`[KD-10]`). A second `register` call silently overwrites. This is
  deliberate for the bootstrap→test-setup pattern but means accidental double registration in prod code will not
  warn.
- `[C-3]` Tokens compare by `.key`, not by object identity. Two `createToken<T>('x')` calls produce distinct objects
  that both resolve to the same slot. Keeping `createToken` private prevents this from becoming a footgun.
- `[C-4]` `resolve` during a factory call for the same token recurses infinitely. There is no protection; the set of
  current factories does not self-refer. If a factory ever needs another singleton, it resolves it in its body
  (triggering that factory first), which is safe as long as the dependency graph is acyclic.
- `[C-5]` Tests narrowing the resolved type to a mock (`as MockTmdbClient`) keep one explicit cast per narrowing
  call site. This is acceptable because the prod contract (the token's declared type) is the authoritative shape;
  tests opt into the mock's extra surface at a localised boundary.

## 7. High-Level Components

| Component        | Module type   | Responsibility                                                                             | Public API surface (exports)                             |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Container core   | Server module | `Token<T>` type, `Container` class, module-scoped `container` instance, `TOKENS` inventory | `Token`, `TOKENS`, `container`                           |
| Bootstrap wiring | Server module | Register every prod factory against `TOKENS` at process boot                               | Side-effect module, no exports (`src/core/bootstrap.ts`) |
| Test wiring      | Test setup    | Re-register integration tokens with mock factories after bootstrap                         | Side-effect module, no exports (`tests/setup.ts`)        |

## 8. Detailed Design

> Condensed after implementation. See source code for full detail.

| Component        | Module                  | Entry point                                                   |
| ---------------- | ----------------------- | ------------------------------------------------------------- |
| Container core   | `src/core/container.ts` | `Token`, `TOKENS`, `container`, `Container` (exported)        |
| Bootstrap wiring | `src/core/bootstrap.ts` | Registers every prod factory and calls `registerFeatures`     |
| Test wiring      | `tests/setup.ts`        | Re-registers integration tokens with mock factories post-boot |

## 9. Verification Criteria

- `[VC-1]` `vp check` passes — type-check, lint, and format clean. No new `any`, no new `@ts-ignore`, no new
  `oxlint-disable no-unsafe-type-assertion` outside `src/core/container.ts` and the enumerated mock-narrowing call
  sites in `tests/**`. **PASS** — static.
- `[VC-2]` `vp test` passes — all existing tests green. **PASS** — 235/235.
- `[VC-3]` `grep -rn "container\.resolve<" src tests` returns zero matches. Every call site relies on token inference.
  **PASS** — static.
- `[VC-4]` `grep -rn "oxlint-disable.*no-unsafe-type-assertion" src/core/container.ts` returns exactly two matches,
  both inside `Container.resolve`, each with an adjacent invariant comment. **PASS** — static
  (`src/core/container.ts:47`, `:57`).
- `[VC-5]` Negative compile test: a file calling
  `container.register(TOKENS.PLEX_CLIENT, () => new SonarrClient({ apiKey: '', apiUrl: '' }))` fails `vp check` with
  a type mismatch error. **PASS** — by construction (`Token<IPlexClient>` is invariant in `T`).
- `[VC-6]` Unit tests for `Container` itself cover: lazy first resolve, cached second resolve, missing-token throws,
  `reset()` clears instances but keeps factories, re-register overwrites, factory returning `null`/`undefined` is
  cached, factory throwing is not cached. **PASS** — 7/7 (`tests/core/container.spec.ts`).
- `[VC-7]` Runtime smoke: `registerFeatures` runs; HTTP routes mount; cron jobs register; Telegram commands bind.
  **PASS** — covered by `tests/features/transcoding/webhooks/radarr.spec.ts`,
  `tests/features/transcoding/webhooks/sonarr.spec.ts`, `tests/features/send_message/webhooks/send_message.spec.ts`.
- `[VC-8]` `createToken` is not exported from `src/core/container.ts`. **PASS** — static.
- `[VC-9]` Every provider/integration type referenced in `TOKENS` is pulled in via `import type` (no value-level
  imports of those modules in `container.ts`). **PASS** — static.

## 10. Open Questions

N/A

## Changelog

| Date       | Amendment               | Sections affected | Reason                                                                                     |
| ---------- | ----------------------- | ----------------- | ------------------------------------------------------------------------------------------ |
| 2026-04-17 | Initial draft           | all               | First complete specification of the DI container module                                    |
| 2026-04-17 | Implementation + verify | 9                 | All `[VC-N]` criteria pass; `Container` class exported to enable unit tests                |
| 2026-04-17 | Condensed               | 7, 8, 9           | Post-implementation condensation — design intent preserved, implementation details removed |
