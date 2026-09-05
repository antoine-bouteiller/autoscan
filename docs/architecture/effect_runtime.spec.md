---
title: Effect Runtime Contract
status: implemented
author: Antoine Bouteiller
date: 2026-08-14
parent-spec: docs/architecture/architecture.spec.md
related: [docs/project_structure.spec.md]
---

## 2. Problem Statement

N/A — goals are owned by `docs/architecture/architecture.spec.md`.

## 3. Key Design Decisions

| Decision                    | Choice                                                                                                            | Rationale                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[KD-1]` Service contracts  | Database, integration clients, providers, and workflow owners use `Context.Service` keys.                         | Effect requirements remain statically visible and concrete implementations can be exchanged by a layer (`src/core/runtime.service.ts:19`).           |
| `[KD-2]` Callback execution | Scheduled callbacks use `CallbackRuntime.runPromise`, backed by a scoped `FiberSet`.                              | Native cron callbacks receive a Promise boundary while their effects remain tracked for shutdown (`src/core/bootstrap.ts:60`).                       |
| `[KD-3]` Workflow admission | Background work and keyed authentication tasks serialize admission and reject work after intake stops.            | The shutdown sequence cannot race a newly admitted task (`src/core/runtime.service.ts:84`).                                                          |
| `[KD-4]` Boundary failures  | Recoverable failures remain Effect errors until a provider boundary logs and maps them to its transport contract. | Shared workflows avoid duplicate logging while HTTP and Telegram preserve stable client-facing behavior (`src/providers/http/http.provider.ts:115`). |

## 4. Principles & Intents

- `[PI-1]` Scoped asynchronous work — refines umbrella `[PI-3]`: fibers belong to an owner that exposes intake, drain, and clear operations.
- `[PI-2]` Typed recoverable failures — refines umbrella `[PI-2]`: provider boundaries, not shared clients, present failures to callers.

## 5. Non-Goals

- `[NG-1]` Untracked background execution — refines umbrella `[NG-2]`: feature and integration code does not create a root runtime.

## 6. Caveats

- `[C-1]` The runtime uses Effect and the Bun platform adapter at the versions declared in `package.json:19`.
- `[C-2]` HTTP shutdown permits up to 30 seconds for graceful connection shutdown (`src/providers/http/http.provider.ts:148`).

## 7. High-Level Components

| Component            | Module type              | Responsibility                                                                | Public API surface                                       |
| -------------------- | ------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| Runtime service keys | Effect context           | Identify dependencies and workflow owners                                     | `Database`, clients, providers, `AppRequirements`        |
| Callback runtime     | scoped FiberSet          | Execute native callbacks in application requirements                          | `runPromise`, `awaitEmpty`, `clear`                      |
| Workflow owners      | scoped FiberSet/FiberMap | Admit, track, drain, and interrupt asynchronous work                          | `BackgroundTasks`, `TranscodeScan`, authentication tasks |
| Provider boundaries  | transport providers      | Execute effects and translate failures at HTTP, scheduler, and Telegram edges | provider methods                                         |

## 8. Detailed Design

### Service and requirement model

`runtime.service.ts` declares service keys for database, integration clients, and providers, then combines workflow dependencies into `AppRequirements` (`src/core/runtime.service.ts:42`). Effects request those services through their requirements; composition supplies them as layers.

### Callback and workflow ownership

`CallbackRuntime` contains a `FiberSet`, a Promise runner, and drain/clear operations (`src/core/runtime.service.ts:110`). The scheduler stores that runner and uses it only while accepting callbacks; duplicate job names are skipped by the provider (`src/providers/scheduler/scheduler.provider.ts:19`). `BackgroundTasks` guards admission with a semaphore and tracks admitted fibers in its own set (`src/core/runtime.service.ts:84`); keyed authentication polling uses the equivalent `FiberMap` pattern (`src/core/authentication.service.ts`).

### Native adapters and polling

Bun remains the process runtime through `runMain` (`src/index.ts:16`). The HTTP provider obtains its server from the Bun platform adapter, and the scheduler uses `Bun.cron` unless a boundary fake is supplied (`src/providers/scheduler/scheduler.provider.ts:19`). Telegram polling maintains an update offset; a failed poll is logged and retried with exponential delay from five seconds up to five minutes (`src/providers/telegram/telegram.provider.ts:135`).

### Queue and workflow behavior

The transcode queue is a scope-owned serial worker. It rejects duplicate or post-intake jobs by file path, tracks the active job, and exposes an idle signal for shutdown (`src/features/transcoding/services/transcode.service.ts:82`). A job creates a recovery marker before processing and cleans its output directory on ordinary failure or interruption; unresolved markers or artifacts become `ReplacementRollbackError` values (`src/features/transcoding/services/transcode.service.ts:25`).

### Failure, diagnostics, and shutdown behavior

HTTP handlers return an internal-error response for non-interruption failures after logging the cause, while preserving interruption (`src/providers/http/http.provider.ts:115`). Telegram resets conversation state, reports an unexpected error, and continues polling on ordinary handler failures (`src/providers/telegram/telegram.provider.ts:43`). Scheduler callback failures are logged at the native callback boundary (`src/providers/scheduler/scheduler.provider.ts:31`). The container coordinates the owners' stop-intake, await-empty, and clear operations within its shutdown deadline. Tests compose local layers with boundary fakes through `makeTestLayer` (`tests/effect.ts:28`).

## 9. Open Questions

N/A
