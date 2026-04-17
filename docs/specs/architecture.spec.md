---
title: Autoscan — Architecture
status: condensed
author: Antoine Bouteiller
date: 2026-04-16
related:
  [
    docs/specs/project-structure.spec.md,
    docs/specs/persistence.spec.md,
    src/providers/http/http.spec.md,
    src/providers/scheduler/scheduler.spec.md,
    src/providers/telegram/telegram.spec.md,
    src/features/transcoding/transcoding.spec.md,
    src/features/language-sync/language-sync.spec.md,
    src/features/queue-cleanup/queue-cleanup.spec.md,
    src/features/dynamic-dns/dynamic-dns.spec.md,
    src/features/trakt-sync/trakt-sync.spec.md,
  ]
---

## 2. Problem Statement

Autoscan is a single-binary media automation service that sits between Plex and the \*arr stack (Radarr/Sonarr),
orchestrating transcoding, language preferences, dynamic DNS, stalled-download cleanup, and Plex → Trakt watch-history
sync. It runs as one long-lived Node.js process that exposes webhook endpoints, polls a Telegram bot for operator
commands, and runs cron jobs on an internal scheduler.

- `[G-1]` Provide a single runtime that owns three core ingress surfaces: HTTP (webhooks), Telegram (bot), Scheduler (cron).
- `[G-2]` Keep wiring explicit and testable — external clients injectable, no implicit globals beyond the DI container.
- `[G-3]` Fail loudly at boot when configuration is missing, succeed silently once running.
- `[G-4]` Keep the runtime cheap enough to run on a home server (one process, no external orchestrator).
- `[G-5]` Keep features independent and individually removable — each feature plugs into the core providers and never
  imports from another feature.

## 3. Key Design Decisions

| Decision                    | Choice                                                                                                     | Rationale                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `[KD-1]` Process model      | One Node.js process, three core runtime providers started in `src/index.ts`                                | Avoids container orchestration; matches homelab deployment                        |
| `[KD-2]` DI                 | Hand-rolled singleton container in `src/core/container.ts`                                                 | Enough for ~10 services; avoids a framework and its runtime cost                  |
| `[KD-3]` HTTP layer         | Native `node:http` (no Fastify/Express)                                                                    | Prior refactor to shed Fastify (commit 3fd6395) reduced footprint and bundle size |
| `[KD-4]` Config             | Zod-validated env in `src/config/env.ts`, Docker-secret `*_FILE` fallback                                  | Fail-fast at boot; secret files supported for Docker deployments                  |
| `[KD-5]` Validation         | Zod at every untrusted boundary (env, HTTP bodies, external API responses)                                 | One validation idiom across the codebase; validators double as exported types     |
| `[KD-6]` Error model        | Result-style: functions return `Error \| Value`; callers use `isError()`/`isOk()` type guards              | Avoids exception control flow for expected failures; expected errors are data     |
| `[KD-7]` Persistence        | Drizzle ORM with dual-backend (`node-postgres` for prod, PGlite for dev/test) resolved from `DATABASE_URL` | Same schema works in-process for tests and against Postgres in prod               |
| `[KD-8]` Scheduler          | `croner` with `Europe/Paris` timezone                                                                      | Minimal dep; centralized `Cron` instances for clean shutdown                      |
| `[KD-9]` Module resolution  | Subpath imports `#core/*`, `#features/*`, `#integrations/*`, `#shared/*`, `#media/*`, `#config/*`          | Avoid relative `../../..` imports                                                 |
| `[KD-10]` Feature isolation | Each feature declares a `register.ts` that wires itself to the core providers; features never cross-import | Preserves plug-in shape; any feature can be deleted without touching others       |
| `[KD-11]` Shared media      | `src/media/` holds the media repository + metadata service used by multiple features                       | Removes the language-sync ↔ transcoding ↔ trakt-sync cross-imports                |

## 4. Principles & Intents

- `[PI-1]` **Core vs. features.** Core owns the runtime ingress surfaces (HTTP, Scheduler, Telegram bot) and cross-cutting
  infra (container, bootstrap, logger, db, env). Features are the business capabilities (transcoding, language-sync,
  queue-cleanup, dynamic-dns, trakt-sync, send-message). HTTP/Scheduler/Telegram are **not** features.
- `[PI-2]` **Features register themselves.** Each feature exports a `register*()` function from `register.ts` that
  resolves the needed core providers and attaches its routes / cron handlers / telegram commands. `core/bootstrap.ts`
  calls every feature's register exactly once at boot.
- `[PI-3]` **Features are independent.** A feature module may import from `#core`, `#config`, `#database`, `#media`,
  `#shared`, `#integrations`. It must not import from `#features/<other>`. If two features need the same code, extract
  it to `#media`, `#shared`, or a new domain module.
- `[PI-4]` **Return errors, don't throw.** Anything that crosses an IO boundary returns a tagged `Error` subclass on
  failure. Throws are reserved for "this should never happen" programmer errors.
- `[PI-5]` **Config is validated once at boot.** `src/config/env.ts` parses once at import time; modules import `env`
  as the already-validated value.
- `[PI-6]` **Integrations thin, services thick.** `src/integrations/*` wrap external clients with typed Zod results;
  feature services compose integrations into business logic.
- `[PI-7]` **No default exports.** Named exports everywhere (see `CLAUDE.md`).
- `[PI-8]` **`types` over `interface` unless declaring a class contract** — per project TS style guide.

## 5. Non-Goals

- `[NG-1]` Not a multi-tenant service — single Plex server, single Radarr, single Sonarr, single Telegram chat (see
  `TELEGRAM_CHAT_ID` gate in `src/providers/telegram/telegram.provider.ts`).
- `[NG-2]` Not a distributed system — no external queue, no retries across restarts, no persistence of transcode queue state.
- `[NG-3]` Not a Radarr/Sonarr replacement — we only consume their webhooks and queue API, we do not manage downloads.
- `[NG-4]` No web UI — operator input is exclusively Telegram + HTTP webhooks.
- `[NG-5]` No dynamic feature discovery — features are imported explicitly from `core/bootstrap.ts`; adding a feature
  requires editing bootstrap (intentional, keeps the graph explicit).

## 6. Caveats

- `[C-1]` Memory: module-level singletons (strike counts in `queue-cleanup/cleanup.service.ts`, in-memory transcode
  queue in `transcoding/transcode.service.ts`, conversation state in `TelegramProvider`) are intentionally
  process-local; a restart resets them. See session S506 / S511 investigation — `pg.Pool` was the primary memory
  culprit, unrelated to this design.
- `[C-2]` The Telegram provider is single-conversation — only one multi-step conversation can be active at once.
- `[C-3]` `SIGTERM` is not handled; only `SIGINT` triggers graceful shutdown (`src/index.ts`).
- `[C-4]` DB init uses top-level `await` in `src/config/db.ts` — the module graph is blocked until migrations complete.
- `[C-5]` Features are wired via side-effectful `register*()` calls executed during `core/bootstrap.ts` import. The
  order inside bootstrap is irrelevant (no feature depends on another's registration), but a crash in any feature's
  register aborts the whole boot.

## 7. High-Level Components

| Component                   | Module type         | Responsibility                                                                          | Public API surface                                                                                                                                                                                             |
| --------------------------- | ------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bootstrap                   | Entry script        | Register clients/providers in container, invoke feature `register*()`s, handle `SIGINT` | `src/index.ts`, `src/core/bootstrap.ts`                                                                                                                                                                        |
| DI Container                | Utility module      | Token-based singleton registry                                                          | `container.register`, `container.resolve`, `container.reset`, `TOKENS`                                                                                                                                         |
| HTTP Provider               | Core runtime        | Server lifecycle + route registry                                                       | `HttpProvider` — see [http](../../src/providers/http/http.spec.md)                                                                                                                                             |
| Telegram Provider           | Core runtime        | Long-poll + command/conversation dispatch                                               | `TelegramProvider` — see [telegram](../../src/providers/telegram/telegram.spec.md)                                                                                                                             |
| Scheduler Provider          | Core runtime        | Cron job registry                                                                       | `SchedulerProvider` — see [scheduler](../../src/providers/scheduler/scheduler.spec.md)                                                                                                                         |
| Config                      | Module              | Zod-parsed env + Docker-secret support + logger                                         | `env` (default export from `src/config/env.ts`), `logger` (`src/config/logger.ts`)                                                                                                                             |
| Database (init)             | Module              | Dual-backend (pg / PGlite) with auto-migrate                                            | `db` (default export from `src/config/db.ts`), schema from `src/database/schema.ts`                                                                                                                            |
| Media domain                | Module              | Media metadata retrieval (used across features)                                         | `src/media/metadata.service.ts`, `src/media/errors.ts`                                                                                                                                                         |
| Media repository            | Shared module       | Drizzle queries on `media` (consumed across features)                                   | `src/shared/media.repository.ts`                                                                                                                                                                               |
| Integrations                | Clients             | Typed wrappers around external HTTP APIs + FFmpeg                                       | `PlexClient`, `TmdbClient`, `TraktClient`, `RadarrClient`, `SonarrClient`, `CloudflareClient`, `TelegramClient`, `FfmpegClient`                                                                                |
| Features                    | Registered plug-ins | Business capabilities — each wires itself to core providers                             | `registerTranscoding`, `registerLanguageSync`, `registerQueueCleanup`, `registerDynamicDns`, `registerTraktSync`, `registerSendMessage`                                                                        |
| Shared (utils/errors/types) | Helpers             | HTTP client factory, fs safe wrappers, error guards, ISO code map, generic errors       | `httpClient`, `isError`, `isOk`, `logError`, `safeExistsSync`, `safeReadFileSync`, `safeMkdirSync`, `spawnPromise`, `normalizeToIso1`, `HttpError`, `NetworkError`, `ValidationError`, `CommandExecutionError` |

## 8. Detailed Design

> Condensed after implementation. See source code for full detail.

| Component                   | Module                             | Entry point                                                                                                                                                                                                                           |
| --------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bootstrap                   | `src/`, `src/core/`                | `src/index.ts`, `src/core/bootstrap.ts`                                                                                                                                                                                               |
| DI Container                | `src/core/`                        | `src/core/container.ts` (`Container`, `TOKENS`)                                                                                                                                                                                       |
| HTTP Provider               | `src/providers/http/`              | `src/providers/http/http.provider.ts` (`HttpProvider`)                                                                                                                                                                                |
| Telegram Provider           | `src/providers/telegram/`          | `src/providers/telegram/telegram.provider.ts` (`TelegramProvider`)                                                                                                                                                                    |
| Scheduler Provider          | `src/providers/scheduler/`         | `src/providers/scheduler/scheduler.provider.ts` (`SchedulerProvider`)                                                                                                                                                                 |
| Config                      | `src/config/`                      | `src/config/env.ts` (`env`), `src/config/logger.ts` (`logger`)                                                                                                                                                                        |
| Database (init)             | `src/config/`, `src/database/`     | `src/config/db.ts` (`db`), `src/database/schema.ts`                                                                                                                                                                                   |
| Media domain                | `src/media/`                       | `src/media/metadata.service.ts`, `src/media/errors.ts`                                                                                                                                                                                |
| Media repository            | `src/shared/`                      | `src/shared/media.repository.ts`                                                                                                                                                                                                      |
| Integrations                | `src/integrations/<vendor>/`       | `*.service.ts` per vendor: `arr/{radarr,sonarr}.service.ts`, `plex/plex.service.ts`, `tmdb/tmdb.service.ts`, `trakt/trakt.service.ts`, `cloudflare/cloudflare.service.ts`, `telegram/telegram.service.ts`, `ffmpeg/ffmpeg.service.ts` |
| Features                    | `src/features/<feature>/`          | `register.ts` per feature: `transcoding`, `language-sync`, `queue-cleanup`, `dynamic-dns`, `trakt-sync`, `send-message`                                                                                                               |
| Shared (utils/errors/types) | `src/shared/{utils,errors,types}/` | `src/shared/utils/{error,http_client,fs,exec_promisify,iso_codes,array,object}.ts`, `src/shared/errors/{http,network,validation,command}.ts`                                                                                          |

## 9. Verification Criteria

- `[VC-1]` Type-check passes: `vp check`.
- `[VC-2]` Test suite passes: `vp test` — **PASS** (`tests/**/*.spec.ts`).
- `[VC-3]` `src/config/env.ts` throws at import time when any required var is missing (covered by manual boot test).
- `[VC-4]` `container.resolve(TOKENS.X)` returns the same instance on repeated calls (covered implicitly by every
  provider test).
- `[VC-5]` `SIGINT` stops HTTP → Scheduler → Telegram in order (manual / integration-level; no automated test).
- `[VC-6]` Every `src/integrations/**/<name>.service.ts` export implements its `I*Client` interface (type-checked by
  compiler).
- `[VC-7.1]` **Feature independence**: `grep -r "from '#features/" src/features/<feature>/` must only match imports
  from the same feature's directory. Verified by shell audit; any cross-feature import is a spec violation.
- `[VC-8.1]` Each feature exposes a `register.ts` whose `register*()` function wires it to the core providers.

## 10. Open Questions

N/A
