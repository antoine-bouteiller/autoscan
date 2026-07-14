---
title: Scheduler Provider
version: 2.0
date_created: 2026-05-08
last_updated: 2026-06-18
tags: [provider, scheduler, cron, runtime]
---

# Introduction

The scheduler provider is the runtime host for cron-style recurring jobs declared by features. It wraps Bun's built-in
`Bun.cron` in-process scheduler, exposes a small registration API, and is owned by the DI container under
`TOKENS.SCHEDULER_PROVIDER`. Features register jobs through `registerFeatures`; `src/index.ts` calls `stopAll()` on
`SIGINT`.

## 1. Purpose & Scope

In scope: registering, naming, and stopping cron jobs on a single Bun process. Out of scope: distributed scheduling,
job persistence, retries, queueing, leader election, or one-off delayed tasks.

## 2. Definitions

- **Cron pattern**: 5-field string (`minute hour day-of-month month day-of-week`) or a Bun nickname (`@hourly`,
  `@daily`, ...). Schedules are interpreted in **UTC**. Example: `*/5 * * * *` (every 5 minutes).
- **Job**: A `JobConfig` `{ name, pattern, handler }` instance held in the provider's registry.
- **Handler**: Sync or async function executed on each fire; a returned promise marks the run complete.
- **Lifecycle**: `register` -> active fires -> `stopAll` -> terminated.

## 3. Requirements, Constraints & Guidelines

- REQ-001: Jobs are registered through `register({ name, pattern, handler })`; duplicates by `name` are skipped with a
  warning.
- REQ-002: `stopAll()` calls `CronJob.stop()` for every registered job, cancelling future fires, and logs completion.
- REQ-003: Errors raised while constructing a job (e.g., invalid pattern) are caught via `logError`; the host process
  keeps running.
- REQ-004: `Bun.cron` provides a no-overlap guarantee — the next fire time is computed only after the handler settles,
  so a slow run never stacks with the next tick.
- REQ-005: Schedules run in **UTC** (`Bun.cron` does not take a timezone). Patterns are chosen accordingly.
- REQ-006: Under a non-Bun runtime (the Node-based Vitest test runner) `Bun.cron` is unavailable; `register` stores a
  no-op handle so jobs never fire during tests.
- CON-001: One scheduler instance per process; no clustering or cross-process coordination.
- CON-002: `Bun.cron` does not invoke handlers immediately on `register`; the first fire is at the next pattern match.
- CON-003: The scheduler wraps each handler in `try/catch` and routes failures to `logError`, preventing a rejected
  handler from surfacing as an `unhandledRejection`. `Bun.cron` reschedules after an error rather than stopping.
- GUD-001: Use plain 5-field patterns; minute granularity is the finest `Bun.cron` resolution.
- GUD-002: Name jobs with human-readable strings (`"Cleanup"`, `"Trakt Sync"`); the name appears in logs.
- GUD-003: Keep handlers idempotent and short; long work belongs in a dedicated queue (e.g., `transcodeQueue`).
- PAT-001: Declarative registration: features expose `jobs: FeatureJob[]` from `defineFeature`; `registerFeatures`
  resolves the scheduler from the container and calls `scheduler.register(job)` per entry.

## 4. Interfaces & Data Contracts

```ts
// src/providers/scheduler/scheduler.provider.ts
interface JobConfig {
  handler: () => Promise<void> | void
  name: string
  pattern: string
}

class SchedulerProvider {
  register(config: JobConfig): void
  registerMany(configs: JobConfig[]): void
  stopAll(): void
}

// src/core/feature.ts
interface FeatureJob {
  readonly handler: () => Promise<void> | void
  readonly name: string
  readonly pattern: string
}
```

`Bun.cron` pattern grammar: `minute hour day-of-month month day-of-week`, plus the `*`, `,`, `-`, `/` operators,
`JAN`-`DEC` / `SUN`-`SAT` names, and `@hourly`/`@daily`/... nicknames. When both day-of-month and day-of-week are
restricted the job fires when **either** matches (POSIX OR semantics).

## 5. Acceptance Criteria

- AC-001: Given a feature exposes `jobs: [{ name, pattern, handler }]`, When `registerFeatures` runs, Then
  `scheduler.register` is called for each job and the cron fire subsequently invokes the handler.
- AC-002: Given two registrations share the same `name`, When the second `register` is called, Then a warning is logged
  and the duplicate is skipped.
- AC-003: Given an invalid cron pattern, When `register` is called, Then the error is logged and the function returns
  without throwing.
- AC-004: Given a handler throws, When it next fires, Then the scheduler logs the error and `Bun.cron` schedules the
  next fire (no scheduler crash).
- AC-005: Given the process receives `SIGINT`, When `stopAll()` runs, Then no further fires occur for any registered job.

## 6. Test Automation Strategy

- Unit-test `register` to assert duplicate-name skip, error swallowing, and registry growth.
- Unit-test `stopAll` to assert every registered job's `stop()` is called.
- Under Vitest (Node), `Bun` is undefined so `register` is a no-op; real cron timing is not exercised in CI. Rely on
  Bun's own test suite for pattern correctness.

## 7. Rationale & Context

`Bun.cron` (Bun >= 1.3.12) replaces the previous `croner` dependency: it is a native, zero-dependency in-process
scheduler whose callback shares state with the application (closures, the DB connection, module-level guards), with a
built-in no-overlap guarantee. The provider stays intentionally thin: features declare `FeatureJob` literals, the
container wires the singleton, and `core/feature.ts` performs registration. This keeps schedule policy co-located with
each feature while centralising the lifecycle (start on boot, stop on `SIGINT`).

## 8. Dependencies & External Integrations

### Technology Platform Dependencies

- PLT-001: `Bun.cron(schedule, handler)` returning a `CronJob` (`.stop()`, `.ref()`, `.unref()`). Requires Bun >= 1.3.12.
- PLT-002: Bun runtime (single-process, single event loop).

### Internal Dependencies

- INT-001: `@/config/logger` for `logger.info` / `logger.warn`.
- INT-002: `@/shared/utils/error` `logError` for caught construction and handler errors.
- INT-003: `@/core/container` registers the singleton under `TOKENS.SCHEDULER_PROVIDER`.

## 9. Examples & Edge Cases

```ts
// src/features/queue_cleanup/feature.ts
export const queueCleanupFeature = defineFeature({
  jobs: [{ handler: runCleanupProcess, name: 'Cleanup', pattern: '*/10 * * * *' }],
  name: 'queue_cleanup',
})
```

Cron patterns currently shipped:

| Feature       | Job name      | Pattern        | Cadence                           |
| ------------- | ------------- | -------------- | --------------------------------- |
| queue_cleanup | Cleanup       | `*/10 * * * *` | every 10 minutes                  |
| language_sync | Language Sync | `0 */12 * * *` | every 12 hours (00:00, 12:00 UTC) |
| transcoding   | Transcode     | `0 */12 * * *` | every 12 hours (00:00, 12:00 UTC) |
| trakt_sync    | Trakt Sync    | `0 */12 * * *` | every 12 hours (00:00, 12:00 UTC) |

Edge cases:

- Long-running handler overlaps with next fire: `Bun.cron` waits for the handler to settle before scheduling the next
  fire, so runs never stack. `runTranscodeProcess` additionally guards with module-level state (`isScanning`).
- Schedules are UTC: the 12-hour jobs fire at 00:00 and 12:00 UTC (previously `Europe/Paris` under croner).
- Duplicate registration: skipped with a warning; safe for hot-reload paths but signals a bug at startup.

## 10. Validation Criteria

- `bun run check` and `bun run test` pass with the scheduler module touched.
- Registered job count at boot equals the sum of `feature.jobs?.length` across features.
- `SIGINT` shutdown logs `All cron jobs stopped` and the process exits cleanly.

## 11. Related Specifications / Further Reading

- ../../../docs/architecture/container.spec.md
- ../../../docs/architecture/feature_registration.spec.md
- https://bun.com/docs/runtime/cron
