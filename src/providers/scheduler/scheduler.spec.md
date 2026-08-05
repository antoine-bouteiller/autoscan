---
title: Scheduler Provider
version: 2.0
last_updated: 2026-08-05
---

# Contract

`SchedulerProvider` keeps native `Bun.cron`. Features register `{ name, pattern, handler }` records after the Effect graph is acquired.

- Duplicate names are skipped.
- Every cron callback runs its Effect through the scoped callback bridge and awaits the resulting Promise.
- Bun's native no-overlap behavior remains authoritative; no second semaphore is added.
- A failed run is logged once and does not suppress later runs.
- `stopAll()` stops future triggers before shutdown waits for tracked active jobs.
- The runtime allows cooperative completion for up to 30 seconds, then interrupts remaining tracked work.
- Tests use a Bun-native cron factory seam; no alternate test runtime branch exists.

# Validation

`tests/providers/scheduler/scheduler.provider.spec.ts` covers execution, failed-run recovery, and handle finalization. `bun run check` and `bun run test` must pass.
