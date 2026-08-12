---
title: Effect v4 Runtime Contract
version: 1.2
date_created: 2026-08-05
last_updated: 2026-08-06
tags: [architecture, effect, runtime, reliability]
---

# Runtime boundary

Autoscan targets exactly `effect@4.0.0-beta.103`, `@effect/platform-bun@4.0.0-beta.103`, and `@effect/platform-node-shared@4.0.0-beta.103`. `@effect/tsgo@0.36.0` patches the existing oxlint type-aware engine. Bun remains the runtime, package manager, test runner, HTTP server, cron host, SQL client, and subprocess host.

`BunRuntime.runMain(program)` owns the only root runtime. Environment secret loading and Effect Schema validation remain eager startup trust-boundary checks. Effect owns database acquisition and migration, service composition, scopes, interruption, schedules, typed recoverable failures, and supervised workflows.

# Native adapters

- `BunHttpServer`, `Bun.cron`, Bun SQL, Drizzle, and Effect Schema remain native adapters; `BunServices.layer` provides `FileSystem` and `ChildProcessSpawner`.
- Scheduler callbacks receive one runner backed by a scoped `FiberSet`; HTTP handlers execute directly in the request Effect, and feature and integration modules never create runtimes.
- Telegram polling is a root-scoped Effect with interruptible long polling and exponential backoff from 5 seconds to 5 minutes.
- Scheduler callbacks await tracked job completion, preserving Bun's no-overlap behavior.
- Background scans and keyed Trakt authentication tasks launch directly through `FiberSet.run` / `FiberMap.run`; admission and intake shutdown are serialized. The serial transcode worker is scope-owned.

# Shutdown

Shutdown stops scheduler and HTTP intake first. `BunHttpServer` allows graceful connection shutdown for up to 30 seconds while tracked callbacks and transcode work drain. At the deadline the runtime interrupts remaining tracked fibers. Provider and database scopes then release in reverse dependency order. Finalizers do not call `process.exit`.

# Error policy

Recoverable network, status, validation, command, filesystem, database, and domain failures use `Data.TaggedError` values in Effect error channels. Shared clients do not log. Provider or workflow boundaries log once and map failures to their stable user-facing contract. Mutation requests and FFmpeg operations are not retried automatically. GET requests retry only network failures, 429 responses, and 5xx responses at most twice within the request deadline.

# Transcode durability

The serial worker deduplicates queued and active media. Replacement validates video and audio streams, streams outputs to unique same-directory staging paths with cancellation, then fsyncs files and directories, backs up collisions, installs atomically, and rolls back in an uninterruptible region. Interruption waits for staging streams to close before cleanup. A rollback failure returns `ReplacementRollbackError` with recovery artifact paths and preserves those artifacts.

# Testing and diagnostics

Effectful diagnostics use the application `Logger` layer with ordered context annotations and original Causes; native logging is limited to scheduler callbacks and synchronous transcode stream-selection helpers. ARR queue reads aggregate every page and queue removals are fail-fast with concurrency four.

Tests use `bun:test`, local layers, Effect's test clock, and native boundary fakes. CI runs `oxfmt --check .`, Effect-aware `oxlint`, and `tsc --noEmit` directly as non-mutating verification. Database lifecycle tests prove closure after success and migration failure.
