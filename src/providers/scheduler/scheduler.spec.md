---
title: Scheduler Provider
status: implemented
author: Antoine Bouteiller
date: 2026-08-14
related:
  [
    docs/project_structure.spec.md,
    docs/architecture/architecture.spec.md,
    src/features/language_sync/language_sync.spec.md,
    src/features/transcoding/transcoding.spec.md,
  ]
---

## 2. Problem Statement

Autoscan features need recurring work without embedding Bun cron handles or Effect runtime bridging in business modules. The scheduler hosts named cron jobs, ensures failures remain observable, and stops accepting work when application shutdown begins.

- `[G-1]` Register named Effect handlers against cron expressions through a single provider.
- `[G-2]` Isolate a failed scheduled run so later invocations remain eligible to execute.
- `[G-3]` Stop native triggers and reject callbacks once shutdown begins.

## 3. Key Design Decisions

| Decision                | Choice                                                                            | Rationale                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `[KD-1]` Cron engine    | Delegate trigger timing to `Bun.cron`.                                            | Bun owns the runtime's native scheduler semantics, avoiding a parallel timing implementation.             |
| `[KD-2]` Runtime bridge | Require a `runPromise` function that runs each handler Effect.                    | The composition root controls the Effect runtime and scope in which feature dependencies execute.         |
| `[KD-3]` Identity       | Key registered handles by job name and skip duplicate names.                      | A stable name prevents accidental duplicate triggers for the same feature responsibility.                 |
| `[KD-4]` Run failure    | Catch and log each handler cause inside the callback.                             | An observed failed run must resolve its callback Promise so native scheduling can invoke subsequent runs. |
| `[KD-5]` Shutdown gate  | Set `accepting` false, stop every native handle, and check the gate in callbacks. | The guard prevents callbacks retained by the cron engine from admitting work during shutdown.             |

## 4. Principles & Intents

- `[PI-1]` Feature-owned work — features supply job name, expression, and Effect; the provider owns host lifecycle only.
- `[PI-2]` Failure visibility — registration, stopping, and handler failures are logged with the Scheduler context rather than discarded.
- `[PI-3]` Native semantics — overlap and timing behavior come from Bun rather than a provider-side semaphore.

## 5. Non-Goals

- `[NG-1]` The provider does not parse cron expressions or persist schedules.
- `[NG-2]` The provider does not retry failed jobs or retain execution history.
- `[NG-3]` The provider does not interrupt, await, or track jobs already running when `stopAll` runs.

## 6. Caveats

- `[C-1]` A `SchedulerProvider` requires `runPromise`; only the cron factory is optional and defaults to `Bun.cron` (`src/providers/scheduler/scheduler.provider.ts:16-30`).
- `[C-2]` Duplicate names and registrations during shutdown are skipped with warnings rather than failing the caller (`src/providers/scheduler/scheduler.provider.ts:32-40`).
- `[C-3]` A throwing `stop` call is logged and does not prevent the provider from stopping remaining handles (`src/providers/scheduler/scheduler.provider.ts:58-67`).
- `[C-4]` Native cron creation failures are caught and logged; no handle is stored for that registration (`src/providers/scheduler/scheduler.provider.ts:42-49`).
- `[C-5]` The job map retains stopped handles, so job names remain unavailable for the provider lifetime (`src/providers/scheduler/scheduler.provider.ts:23-24`, `src/providers/scheduler/scheduler.provider.ts:58-67`).
- `[C-6]` The provider logs successful registration with the configured name and cron pattern (`src/providers/scheduler/scheduler.provider.ts:45-46`).
- `[C-7]` `registerMany` does not provide a transaction: an individual registration failure does not stop iteration (`src/providers/scheduler/scheduler.provider.ts:42-55`).

## 7. High-Level Components

| Component              | Module type           | Responsibility                                                  | Public API surface                                         |
| ---------------------- | --------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| Scheduler provider     | Runtime host          | Register native cron handles and gate callbacks during shutdown | `SchedulerProvider`, `register`, `registerMany`, `stopAll` |
| Job configuration      | Internal contract     | Bind a unique name and cron pattern to an application Effect    | `JobConfig`                                                |
| Runtime and cron seams | Constructor contracts | Execute Effects and create stop-capable scheduled handles       | `runPromise`, `cron`, `ScheduledJob`                       |

## 8. Detailed Design

### Scheduler provider

The provider begins in an accepting state, retains `ScheduledJob` handles in a map keyed by name, and uses native `Bun.cron` unless composition supplies a factory (`src/providers/scheduler/scheduler.provider.ts:21-30`). `register` refuses work once stopped and skips a name already in the map. It wraps the configured Effect with cause-aware error logging, installs a callback that runs it only while accepting, and stores the returned handle (`src/providers/scheduler/scheduler.provider.ts:32-49`).

`registerMany` applies this same admission policy to each config in input order (`src/providers/scheduler/scheduler.provider.ts:52-56`). `stopAll` closes the admission gate, calls `stop` on every known handle, logs individual stop failures, and reports completion. A callback during this state resolves without calling `runPromise` (`src/providers/scheduler/scheduler.provider.ts:58-67`).

The registered callback returns the Promise produced by `runPromise`, allowing the native scheduler to observe the full Effect execution. A handler failure becomes a logged successful callback result through its local `catchCause` boundary (`src/providers/scheduler/scheduler.provider.ts:42-45`).

### Job configuration

Each job carries a `name`, a cron `pattern`, and a `handler` Effect that returns void, may fail with `Error`, and requires `AppRequirements` (`src/providers/scheduler/scheduler.provider.ts:6-10`). The name is the provider's uniqueness boundary; the pattern is passed unchanged to the native cron engine.

### Runtime and cron seams

`runPromise` turns the registered Effect into the Promise required by Bun's callback API. The optional `cron` seam accepts the same pattern and callback shape and returns only a `stop` capability (`src/providers/scheduler/scheduler.provider.ts:12-19`). This keeps the provider independent of a test-only scheduling runtime while allowing controlled callback invocation.

## 9. Open Questions

N/A
