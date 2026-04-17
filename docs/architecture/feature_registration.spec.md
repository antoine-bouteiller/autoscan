---
title: Feature Registration
status: condensed
author: Antoine Bouteiller
date: 2026-04-17
related:
  [
    docs/project_structure.spec.md,
    src/providers/http/http.spec.md,
    src/providers/scheduler/scheduler.spec.md,
    src/providers/telegram/telegram.spec.md,
    src/features/transcoding/transcoding.spec.md,
    src/features/language_sync/language_sync.spec.md,
    src/features/queue_cleanup/queue_cleanup.spec.md,
    src/features/dynamic_dns/dynamic_dns.spec.md,
    src/features/trakt_sync/trakt_sync.spec.md,
    src/features/send_message/send_message.spec.md,
  ]
---

## 2. Problem Statement

Each feature in `src/features/<name>/register.ts` duplicates three kinds of boilerplate:

1. Resolving provider instances from the DI container (`container.resolve<HttpProvider>(TOKENS.HTTP_PROVIDER)`, etc.).
2. Wrapping the actual wiring (HTTP routes, cron jobs, telegram commands, telegram conversations) in an imperative
   function whose body is 90% configuration data.
3. Being hand-imported and hand-invoked in `src/core/bootstrap.ts`, which grows one line per feature for the import
   and one line for the invocation.

The current six features total 108 lines of `register.ts`, most of which are container plumbing. Adding a new feature
means editing `bootstrap.ts` in two places on top of writing the feature itself. The registration signal is drowned
in ceremony.

- `[G-1]` Reduce per-feature registration to a single declarative object — no container access, no helper function.
- `[G-2]` Make adding a feature a one-file change: create the feature folder, export its declaration, done.
- `[G-3]` Preserve every capability of the current imperative `register.ts` files (HTTP routes with validators, cron
  jobs, Telegram commands, Telegram conversations) with no loss of type safety.
- `[G-4]` Make the `Feature` type the only wiring surface. New registration needs extend the type — features never
  bypass `registerFeatures` with ad-hoc container access.

## 3. Key Design Decisions

| Decision                    | Choice                                                                                                                                                                           | Rationale                                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[KD-1]` Feature shape      | Declarative `Feature` object exported from `src/features/<name>/feature.ts`, built via `defineFeature({ ... })`                                                                  | Data is easier to read, diff, and lint than imperative code; the common case has no moving parts                                                                                                    |
| `[KD-2]` Primitives surface | Four optional fields: `routes`, `jobs`, `commands`, `conversations`                                                                                                              | Exhaustively covers the six existing features; each maps 1:1 to an existing provider method                                                                                                         |
| `[KD-3]` Loader             | Single `registerFeatures(features: Feature[])` in `src/core/feature.ts` resolves providers once and iterates                                                                     | The DI container boilerplate concentrates in one place instead of being copy-pasted per feature                                                                                                     |
| `[KD-4]` Bootstrap wiring   | Hand-maintained `src/features/index.ts` barrel imports every `<name>Feature` and re-exports them as a single `features` array; `bootstrap.ts` calls `registerFeatures(features)` | Adding a feature edits exactly two files; `bootstrap.ts` itself never changes. No codegen — the barrel is short and review-visible. Named array avoids `eslint-plugin-import/no-namespace`          |
| `[KD-5]` File naming        | `src/features/<name>/feature.ts` replaces `src/features/<name>/register.ts`; the exported constant is `<name>Feature`                                                            | New name signals the declarative shape; old `register.ts` is deleted, not renamed, to avoid confusion during review                                                                                 |
| `[KD-6]` Route shape        | `FeatureRoute` is `(http: HttpProvider) => void`; features build entries via `postRoute(path, validator, handler)` and `getRoute(path, handler)` helpers                         | Preserves the existing `HttpProvider.post` generic that links validator output to handler body type; homogeneous array of object literals cannot carry a per-element generic without internal casts |

## 4. Principles & Intents

- `[PI-1]` **Declaration over invocation.** A feature's wiring should read as data. If writing a declaration requires
  more than a one-line helper call, the primitive set is missing something — add a primitive, do not add a bespoke
  function body to a feature.
- `[PI-2]` **One place, one resolve.** The three runtime providers (HTTP, scheduler, Telegram) are resolved exactly
  once per process, inside `registerFeatures`. A feature's `feature.ts` never touches `container` or `TOKENS`.
  Integration clients (Plex, Radarr, Sonarr, TMDB, Trakt, Cloudflare, FFmpeg, Telegram client) stay resolved at the
  call site in services/webhooks/jobs — that is the existing DI pattern and is out of scope for this spec.
- `[PI-3]` **Bootstrap is the list.** `bootstrap.ts` contains DI registrations and a single call to
  `registerFeatures`. It must not grow when features are added.
- `[PI-4]` **Type safety stays strict.** The `Feature` type is a discriminated-field record; route validators remain
  tied to their handler's body type via the existing `z.output<TSchema>` inference in `HttpProvider.post`.
- `[PI-5]` **Extensions change the type.** If a feature needs wiring not covered by the current primitives, extend
  the `Feature` type and the loader. There is no per-feature escape hatch — every feature goes through
  `registerFeatures`.

## 5. Non-Goals

- `[NG-1]` Do not change the DI container (`src/core/container.ts`) — tokens, factories, and resolution semantics
  stay identical.
- `[NG-2]` Do not change provider public APIs (`HttpProvider.post`, `SchedulerProvider.register`,
  `TelegramProvider.registerCommand`, `TelegramProvider.registerConversation`). The refactor is purely a caller-side
  reorganization.
- `[NG-3]` Do not introduce auto-discovery via filesystem glob. Features are explicitly exported from
  `src/features/index.ts`; the barrel is the inventory.
- `[NG-4]` Do not change how tests resolve providers (`tests/utils.ts`) beyond swapping the two `registerTranscoding`
  / `registerSendMessage` dynamic imports for the new feature declarations.
- `[NG-5]` Do not introduce feature flags, lazy loading, or conditional registration as a first-class concept, and
  do not provide a per-feature escape hatch. If a real need appears, extend the `Feature` type.

## 6. Caveats

- `[C-1]` The four primitives (`routes`, `jobs`, `commands`, `conversations`) cover every current feature. A future
  feature that needs e.g. a WebSocket handler or a queue consumer extends the `Feature` type and the loader — there
  is no per-feature escape hatch.

## 7. High-Level Components

| Component        | Module type         | Responsibility                                              | Public API surface (exports)                                            |
| ---------------- | ------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| Feature core     | Server module       | Define the `Feature` shape and the single loader            | `Feature`, `defineFeature`, `postRoute`, `getRoute`, `registerFeatures` |
| Features barrel  | Server module       | Aggregate every feature declaration into one import surface | `features`                                                              |
| Per-feature file | Feature declaration | Declare the feature's routes, jobs, commands, conversations | `<name>Feature`                                                         |

## 8. Detailed Design

> Condensed after implementation. See source code for full detail.

| Component        | Module                                        | Entry point                                                                                                                       |
| ---------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Feature core     | `src/core/feature.ts`                         | `Feature`, `defineFeature`, `postRoute`, `getRoute`, `registerFeatures`                                                           |
| Features barrel  | `src/features/index.ts`                       | `features` array                                                                                                                  |
| Bootstrap wiring | `src/core/bootstrap.ts`                       | `registerFeatures(features)` call at end of file                                                                                  |
| Telegram types   | `src/providers/telegram/telegram.provider.ts` | Exports `CommandHandler` and `Conversation` for reference by the `Feature` type                                                   |
| Per-feature file | `src/features/<name>/feature.ts` (six files)  | `dynamicDnsFeature`, `languageSyncFeature`, `queueCleanupFeature`, `sendMessageFeature`, `traktSyncFeature`, `transcodingFeature` |
| Test wiring      | `tests/utils.ts` (`testWithHttpProvider`)     | Calls `registerFeatures([transcodingFeature, sendMessageFeature])` for HTTP-route tests                                           |

## 9. Verification Criteria

- `[VC-1]` Every `src/features/<name>/feature.ts` exports a single `<name>Feature` constant typed as `Feature`.
  **PASS** — static (see the six `src/features/*/feature.ts` files).
- `[VC-2]` `src/core/bootstrap.ts` contains exactly one call to `registerFeatures` and no direct reference to any
  per-feature symbol. **PASS** — static (`src/core/bootstrap.ts`).
- `[VC-3]` `src/features/index.ts` aggregates every feature declaration into one `features` array and exports nothing
  else. **PASS** — static (`src/features/index.ts`).
- `[VC-4]` No `src/features/<name>/feature.ts` imports from `#core/container`; each `feature.ts` imports from
  `#core/feature` only the helpers `defineFeature`, `postRoute`, and `getRoute`. (Service/webhook/job files retain
  their existing `#core/container` access for integration clients — out of scope for this spec, see `[PI-2]`.)
  **PASS** — static.
- `[VC-5]` Type check, lint, and format all pass: `vp check`. **PASS**.
- `[VC-6]` All existing unit and integration tests pass: `vp test`. **PASS** — 148/148.
- `[VC-7]` The HTTP, scheduler, and telegram behavioral tests produce identical registrations (same routes, same cron
  patterns, same command keys) before and after the refactor — captured by existing tests. **PASS**
  (`tests/features/transcoding/webhooks/radarr.spec.ts`, `tests/features/transcoding/webhooks/sonarr.spec.ts`,
  `tests/features/send_message/webhooks/send_message.spec.ts`).
- `[VC-8]` Adding a new feature requires edits to exactly two files: the new feature folder (`feature.ts` plus its
  internal files) and `src/features/index.ts` (one import line and one array entry). **PASS** — by design.

## 10. Open Questions

N/A

## Changelog

| Date       | Amendment                                                                                                         | Sections affected     | Reason                                                                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-17 | `FeatureRoute` switched from object literal to closure; `postRoute`/`getRoute` helpers added                      | 3 (KD-6), 4 (PI-1), 8 | TS cannot link a per-element validator-to-handler generic in a homogeneous array of object literals without internal casts                                                                 |
| 2026-04-17 | Barrel exports a single `features` array instead of per-feature re-exports; `bootstrap.ts` imports `{ features }` | 3 (KD-4), 8.3, 8.4, 9 | `eslint-plugin-import/no-namespace` blocks `import * as features`; a named aggregate keeps bootstrap stable while satisfying the lint rule                                                 |
| 2026-04-17 | Exported `CommandHandler` and `Conversation` from `telegram.provider.ts`                                          | 8 (new 8.1 note), 8.7 | `Feature` must reference these types; they were previously file-local                                                                                                                      |
| 2026-04-17 | Narrowed `[PI-2]` and `[VC-4]` scope to `feature.ts` files                                                        | 4, 9                  | Original wording over-reached to ban any `#core/container` import under `src/features/`; integration-client resolution in services/webhooks/jobs is a separate DI pattern and out of scope |
| 2026-04-17 | Verification complete                                                                                             | 1 (status)            | All `[VC-N]` criteria pass                                                                                                                                                                 |
| 2026-04-17 | Condensed                                                                                                         | 7, 8, 9               | Post-implementation condensation — design intent preserved, implementation details removed                                                                                                 |
