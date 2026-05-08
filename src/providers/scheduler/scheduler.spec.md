---
title: Scheduler Provider
version: 1.0
date_created: 2026-05-08
last_updated: 2026-05-08
tags: [provider, scheduler, cron, runtime]
---

# Introduction

The scheduler provider is the runtime host for cron-style recurring jobs declared by features. It wraps the `croner`
library, exposes a small registration API, and is owned by the DI container under `TOKENS.SCHEDULER_PROVIDER`. Features
register jobs through `registerFeatures`; `src/index.ts` calls `stopAll()` on `SIGINT`.

## 1. Purpose & Scope

In scope: registering, naming, and stopping cron jobs on a single Node.js process. Out of scope: distributed scheduling,
job persistence, retries, queueing, leader election, or one-off delayed tasks.

## 2. Definitions

- **Cron pattern**: 5- or 6-field string (croner accepts seconds-precision 6-field). Example: `0 */5 * * * *` (every 5
  minutes at second 0).
- **Job**: A `JobConfig` `{ name, pattern, handler, options? }` instance held in the provider's registry.
- **Handler**: Sync or async function executed on each tick; resolved promise marks the run complete.
- **Lifecycle**: `register` -> active ticks -> `stopAll` -> terminated.

## 3. Requirements, Constraints & Guidelines

- REQ-001: Jobs are registered through `register({ name, pattern, handler, options? })`; duplicates by `name` are skipped
  with a warning and the existing `Cron` returned.
- REQ-002: `stopAll()` calls `Cron.stop()` for every registered job, cancelling pending timers, and logs completion.
- REQ-003: Errors raised while constructing a job (e.g., invalid pattern) are caught via `logError` and `register`
  returns `undefined`; host process keeps running.
- REQ-004: No overrun protection is configured by default. If a tick fires while the previous run is still in flight,
  croner schedules the new run concurrently. Features that must serialize use a module-level guard (see
  `runTranscodeProcess` `isScanning` flag).
- REQ-005: All jobs run in the `Europe/Paris` timezone unless overridden through `options.timezone`.
- CON-001: One scheduler instance per process; no clustering or cross-process coordination.
- CON-002: Croner does not invoke handlers immediately on `register`; first tick fires at the next pattern match.
- CON-003: Handler exceptions are not caught by the scheduler. Each handler MUST handle its own errors (`logError`,
  `isError`) or pass `options.catch` to opt into croner's built-in trapping.
- GUD-001: Use seconds-precision (6-field) patterns to anchor runs at `:00` and avoid clock-drift surprises.
- GUD-002: Name jobs with human-readable strings (`"Dynamic DNS"`, `"Trakt Sync"`); the name appears in logs.
- GUD-003: Keep handlers idempotent and short; long work belongs in a dedicated queue (e.g., `transcodeQueue`).
- PAT-001: Declarative registration: features expose `jobs: FeatureJob[]` from `defineFeature`; `registerFeatures`
  resolves the scheduler from the container and calls `scheduler.register(job)` per entry.

## 4. Interfaces & Data Contracts

```ts
// src/providers/scheduler/scheduler.provider.ts
interface JobConfig {
  handler: () => Promise<void> | void
  name: string
  options?: CronOptions // re-exported from croner
  pattern: string
}

class SchedulerProvider {
  register(config: JobConfig): Cron | undefined
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

Croner pattern grammar (seconds optional): `second minute hour day-of-month month day-of-week`. See
`node_modules/croner/README.md` for full reference, including ranges, lists, steps, `L`/`#` modifiers, and DST handling.

## 5. Acceptance Criteria

- AC-001: Given a feature exposes `jobs: [{ name, pattern, handler }]`, When `registerFeatures` runs, Then
  `scheduler.register` is called for each job and the cron tick subsequently invokes the handler.
- AC-002: Given two registrations share the same `name`, When the second `register` is called, Then a warning is logged
  and the existing `Cron` instance is returned.
- AC-003: Given an invalid cron pattern, When `register` is called, Then the error is logged and the function returns
  `undefined` without throwing.
- AC-004: Given a handler throws, When the next tick fires, Then croner schedules and runs the next tick (no scheduler
  crash); error logging is the handler's responsibility.
- AC-005: Given the process receives `SIGINT`, When `stopAll()` runs, Then no further ticks fire for any registered job.

## 6. Test Automation Strategy

- Unit-test `register` with a stub `Cron` to assert duplicate-name skip, error swallowing, and registry growth.
- Unit-test `stopAll` to assert every registered `Cron.stop()` is called.
- Integration-test cron firing using `vi.useFakeTimers()` plus `Cron.trigger()` from croner to invoke handlers
  deterministically.
- Real cron timing is not exercised in CI; rely on croner's own test suite for pattern correctness.

## 7. Rationale & Context

`croner` was chosen for zero native dependencies, TypeScript typings, seconds-precision patterns, timezone support, and
opt-in overrun protection. The provider stays intentionally thin: features declare `FeatureJob` literals, the container
wires the singleton, and `core/feature.ts` performs registration. This keeps schedule policy co-located with each
feature while centralising the lifecycle (start on boot, stop on `SIGINT`).

## 8. Dependencies & External Integrations

### Technology Platform Dependencies

- PLT-001: `croner` ^10 (`new Cron(pattern, options, handler)`, `.stop()`, `.trigger()`).
- PLT-002: Node.js runtime (single-process, single event loop).

### Internal Dependencies

- INT-001: `#/config/logger` for `logger.info` / `logger.warn`.
- INT-002: `#/shared/utils/error` `logError` for caught construction errors.
- INT-003: `#/core/container` registers the singleton under `TOKENS.SCHEDULER_PROVIDER`.

## 9. Examples & Edge Cases

```ts
// src/features/dynamic_dns/feature.ts
export const dynamicDnsFeature = defineFeature({
  jobs: [{ handler: dynDns, name: 'Dynamic DNS', pattern: '0 */5 * * * *' }],
  name: 'dynamic_dns',
})
```

Cron patterns currently shipped:

| Feature       | Job name      | Pattern          | Cadence                       |
| ------------- | ------------- | ---------------- | ----------------------------- |
| dynamic_dns   | Dynamic DNS   | `0 */5 * * * *`  | every 5 minutes (sec 0)       |
| queue_cleanup | Cleanup       | `0 */10 * * * *` | every 10 minutes (sec 0)      |
| language_sync | Language Sync | `0 0 */12 * * *` | every 12 hours (00:00, 12:00) |
| transcoding   | Transcode     | `0 0 */12 * * *` | every 12 hours (00:00, 12:00) |
| trakt_sync    | Trakt Sync    | `0 0 */12 * * *` | every 12 hours (00:00, 12:00) |

Edge cases:

- Long-running handler overlaps with next tick: croner triggers concurrently. `runTranscodeProcess` and `dynDns` both
  guard with module-level state (`isScanning`, `backoffUntil`).
- DST transitions: croner skips ticks in DST gaps and runs only the first occurrence in DST overlaps (Europe/Paris).
- Duplicate registration: returns existing `Cron`; safe for hot-reload paths but signals a bug at startup.

## 10. Validation Criteria

- `vp check` and `vp test` pass with the scheduler module touched.
- Registered job count at boot equals the sum of `feature.jobs?.length` across features.
- `SIGINT` shutdown logs `All cron jobs stopped` and the process exits cleanly.

## 11. Related Specifications / Further Reading

- ../../../docs/architecture/container.spec.md
- ../../../docs/architecture/feature_registration.spec.md
- https://croner.56k.guru/
