---
title: Scheduler — core cron runtime
status: condensed
author: Antoine Bouteiller
date: 2026-04-17
related:
  [
    docs/specs/architecture.spec.md,
    src/features/transcoding/transcoding.spec.md,
    src/features/language-sync/language-sync.spec.md,
    src/features/queue-cleanup/queue-cleanup.spec.md,
    src/features/dynamic-dns/dynamic-dns.spec.md,
    src/features/trakt-sync/trakt-sync.spec.md,
  ]
---

## 2. Problem Statement

Autoscan runs several periodic jobs — transcode sweep, language reconciliation, stalled-download cleanup, dynamic DNS,
Plex → Trakt sync — on an internal cron runner. The scheduler is a **core runtime provider** (not a feature): it owns
the registration table, the `croner` lifecycle, and graceful shutdown. The actual cron jobs are registered by each
feature at boot via its `register*()` function.

- `[G-1]` Run named cron jobs in a stable timezone on a single-process runtime.
- `[G-2]` Provide a feature-agnostic `register({ handler, name, pattern })` API so every feature wires its own jobs.
- `[G-3]` Prevent accidental duplicate registrations (same `name`) by logging a warning and reusing the existing job.
- `[G-4]` Stop every job cleanly on `SIGINT` via `stopAll()`.

## 3. Key Design Decisions

| Decision                    | Choice                                                                                    | Rationale                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `[KD-1]` Library            | `croner`                                                                                  | Zero native deps, predictable DST handling, tiny footprint                                  |
| `[KD-2]` Timezone           | `Europe/Paris` hard-coded                                                                 | Single-tenant homelab; avoids ambiguous local-vs-UTC schedules across DST                   |
| `[KD-3]` Registration model | `Map<name, Cron>` inside the provider                                                     | Name is the idempotency key; also lets `stopAll()` walk the set                             |
| `[KD-4]` Start semantics    | Job starts the moment `new Cron(...)` runs inside `register()`                            | No separate `start()` — boot order is: register integrations → register features → job tick |
| `[KD-5]` Dedup              | Re-registering an existing `name` logs a warning and returns the existing `Cron`          | Idempotent registration — safe for repeated boots (tests call registers twice)              |
| `[KD-6]` Error surface      | Construction failures are caught and logged via `logError(..., 'Scheduler')`; no re-throw | Scheduler itself never aborts boot; a broken pattern disables its job only                  |

## 4. Principles & Intents

- `[PI-1]` **Features own their cron jobs.** `core/bootstrap.ts` only registers the `SchedulerProvider` with the DI
  container. Cron handlers are attached from `features/<feature>/register.ts`. Core never hard-codes a job.
- `[PI-2]` **Name is authoritative.** Two registrations with the same name resolve to the first registration; the
  second is a no-op. Rename jobs carefully.
- `[PI-3]` **No job persistence.** Missed ticks during downtime are simply missed — nothing is queued.
- `[PI-4]` **Handlers are opaque to the scheduler.** The provider doesn't know what a job does; it only invokes the
  handler on schedule.

## 5. Non-Goals

- `[NG-1]` No distributed locking — single-process runtime, one Cron per name.
- `[NG-2]` No runtime reconfiguration — patterns are baked in at register time.
- `[NG-3]` No retries / backoff at the scheduler layer — features that need retries implement them internally (see
  `dynamic-dns` backoff or `telegram` poll backoff as examples of feature-level retry strategies).
- `[NG-4]` No per-job status/observability endpoint — logs only.

## 6. Caveats

- `[C-1]` Timezone is a compile-time constant — changing it requires editing `scheduler.provider.ts`.
- `[C-2]` Jobs registered during module import run as soon as the Cron object is constructed, _before_ the main
  `await http.start()` completes — handler code must tolerate being invoked before the HTTP server is listening.
- `[C-3]` `stopAll()` stops the scheduler from _triggering_ new handler invocations but does not cancel handlers
  already in flight — in-flight jobs run to completion (or are orphaned at `process.exit`).

## 7. High-Level Components

| Component         | Module type                                                    | Responsibility                                                   | Public API surface                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SchedulerProvider | Core runtime (`src/providers/scheduler/scheduler.provider.ts`) | Register / dedup / shutdown of `Cron` jobs                       | `new SchedulerProvider()`, `.register({ handler, name, options?, pattern })`, `.registerMany(configs)`, `.stopAll()`                                                         |
| Feature cron jobs | Handlers owned by features                                     | Business logic per tick; registered from feature's `register.ts` | `runTranscodeProcess` (transcoding), `updatePlexSelectedLanguages` (language-sync), `runCleanupProcess` (queue-cleanup), `dynDns` (dynamic-dns), `traktSyncJob` (trakt-sync) |

**Feature-registered jobs:**

| Job name        | Pattern          | Cadence           | Owning feature  | Registered in                            |
| --------------- | ---------------- | ----------------- | --------------- | ---------------------------------------- |
| `Cleanup`       | `0 */10 * * * *` | every 10 min      | `queue-cleanup` | `src/features/queue-cleanup/register.ts` |
| `Dynamic DNS`   | `0 */5 * * * *`  | every 5 min       | `dynamic-dns`   | `src/features/dynamic-dns/register.ts`   |
| `Transcode`     | `0 0 */12 * * *` | every 12 h at :00 | `transcoding`   | `src/features/transcoding/register.ts`   |
| `Language Sync` | `0 0 */12 * * *` | every 12 h at :00 | `language-sync` | `src/features/language-sync/register.ts` |
| `Trakt Sync`    | `0 0 */12 * * *` | every 12 h at :00 | `trakt-sync`    | `src/features/trakt-sync/register.ts`    |

## 8. Detailed Design

> Condensed after implementation. See source code for full detail.

| Component         | Module                               | Entry point                                                                                                      |
| ----------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| SchedulerProvider | `src/providers/scheduler/`           | `scheduler.provider.ts` (`SchedulerProvider`)                                                                    |
| Feature cron jobs | `src/features/<feature>/register.ts` | `registerTranscoding`, `registerLanguageSync`, `registerQueueCleanup`, `registerDynamicDns`, `registerTraktSync` |

## 9. Verification Criteria

- `[VC-1]` Type-check passes: `vp check`.
- `[VC-2]` Registering the same `name` twice logs a warning and leaves exactly one `Cron` in the internal map (manual /
  integration — no automated test).
- `[VC-3]` `stopAll()` stops every registered job (manual / integration).
- `[VC-4]` Each feature spec's register-criterion (`[VC-7.1]` on feature specs) names the exact jobs it attaches;
  the set of jobs listed in §7 "Feature-registered jobs" matches the union of those criteria.

## 10. Open Questions

N/A
