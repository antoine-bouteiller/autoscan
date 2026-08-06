---
title: Effect v4 Runtime Contract
version: 1.1
date_created: 2026-08-05
last_updated: 2026-08-06
tags: [architecture, effect, runtime, reliability]
---

# Runtime boundary

Autoscan targets exactly `effect@4.0.0-beta.103` and `@effect/platform-bun@4.0.0-beta.103`. `@effect/tsgo@0.32.1` patches the existing oxlint type-aware engine. Bun remains the runtime, package manager, test runner, HTTP server, cron host, SQL client, and subprocess host.

`BunRuntime.runMain(program)` owns the only root runtime. Environment secret loading and Effect Schema validation remain eager startup trust-boundary checks. Effect owns database acquisition and migration, service composition, scopes, interruption, schedules, typed recoverable failures, and supervised workflows.

# Native adapters

- `Bun.serve`, `Bun.cron`, `Bun.spawn`, Bun SQL, Drizzle, and Effect Schema remain native adapters.
- Callback providers receive one runner backed by a scoped `FiberSet`; feature and integration modules never create runtimes.
- Telegram polling is a root-scoped Effect with interruptible long polling and exponential backoff from 5 seconds to 5 minutes.
- Scheduler callbacks await tracked job completion, preserving Bun's no-overlap behavior.
- Background scans, keyed Trakt authentication tasks, and the serial transcode worker are scope-owned.

# Shutdown

Shutdown stops scheduler and HTTP intake first. It allows tracked callbacks and transcode work up to 30 seconds. At the deadline it force-closes HTTP connections before clearing tracked fibers. Provider and database scopes then release in reverse dependency order. Finalizers do not call `process.exit`.

# Error policy

Recoverable network, status, validation, command, filesystem, database, and domain failures use `Data.TaggedError` values in Effect error channels. Shared clients do not log. Provider or workflow boundaries log once and map failures to their stable user-facing contract. Mutation requests and FFmpeg operations are not retried automatically. GET requests retry only network failures, 429 responses, and 5xx responses at most twice within the request deadline.

# Transcode durability

The serial worker deduplicates queued and active media. Replacement validates video and audio streams, copies outputs to unique same-directory staging paths, fsyncs files and directories, backs up collisions, installs atomically, and rolls back in an uninterruptible region. A rollback failure returns `ReplacementRollbackError` with recovery artifact paths and preserves those artifacts.

# Testing and diagnostics

Tests use `bun:test`, local layers, Effect's test clock, and native boundary fakes. The normal `bun run check` is non-mutating and enforces outdated API, floating Effect, missing context, missing error, and duplicate package diagnostics. The isolated contract test under `tests/tooling/` proves those diagnostics without network installs or lockfile changes.
