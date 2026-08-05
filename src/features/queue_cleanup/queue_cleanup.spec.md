---
title: Queue Cleanup Feature
version: 1.0
date_created: 2026-05-08
last_updated: 2026-05-08
tags: [feature, radarr, sonarr, scheduler]
---

# Introduction

The `queue_cleanup` feature periodically inspects the Radarr and Sonarr download queues and removes
entries that are stalled with no connections or that produced unimportable files. It is a
jobs-only feature: no HTTP routes, no Telegram commands.

## 1. Purpose & Scope

- Free the \*arr download queues from stuck or unusable items so other downloads can proceed.
- Out of scope: triaging healthy downloads, retrying searches, blocklisting at the indexer level
  (Radarr/Sonarr handle that when `blocklist=true` is passed on removal).

## 2. Definitions

- **arr**: Radarr (movies) or Sonarr (series).
- **queue**: list of in-flight downloads tracked by an arr instance (`GET /api/v3/queue`).
- **stalled**: download with `status='warning'` and `errorMessage='The download is stalled with no connections'`.
- **no download speed**: download with `status='downloading'` and a missing/null `timeleft` — covers torrent
  clients that never surface a `warning` status when a download stops progressing.
- **blocklist**: arr-side flag that prevents the same release from being grabbed again.

## 3. Requirements, Constraints & Guidelines

- **REQ-001** Run on cron `0 */10 * * * *` (every 10 minutes) under job name `Cleanup`.
- **REQ-002** Remove an item immediately when its `statusMessages` contain `No files found are eligible for import`
  or `Caution: Found potentially dangerous file with extension:`.
- **REQ-003** For stalled items (`status='warning'` and the stalled `errorMessage`) **or** items with no download
  speed (`status='downloading'` and `timeleft` missing/null), increment a per-item strike counter; remove once
  strikes reach `STRIKE_COUNT = 5` (i.e. ~50 minutes).
- **REQ-004** Removal calls `DELETE queue/{id}?blocklist=true&removeFromClient=true` on both Radarr and Sonarr.
- **REQ-005** Process Radarr and Sonarr concurrently via `Promise.all`.
- **REQ-006** After each pass, drop strike counters for items no longer present in **that arr's** queue.
- **REQ-007** Strike counters are scoped per arr. Queue ids are only unique within one arr, so Radarr and Sonarr
  must never read, increment, or evict each other's counters.
- **CON-001** Strike state is held in an in-memory `Map<string, Map<number, number>>` keyed by service name;
  a process restart resets all counters.
- **CON-002** Items missing `title` or `status` are skipped with a warning log; they are never removed.
- **CON-003** `getQueue` failures resolve to `undefined`; that arr is skipped for the run, the other still proceeds.
- **GUD-001** Log every strike increment, every removal, and every skipped malformed item with the `Cleanup` tag
  and the arr service name.
- **PAT-001** Strategy is shared across arrs through the `QueueService` interface — no per-arr branching in the job.

## 4. Interfaces & Data Contracts

- **Cron job**: `{ name: 'Cleanup', pattern: '0 */10 * * * *', handler: runCleanupProcess }`.
- **`runCleanupProcess()`** (`jobs/cleanup.job.ts`) — thin wrapper that awaits `cleanupAll()`.
- **`cleanupAll(): Promise<void>`** (`services/cleanup.service.ts`) — resolves Sonarr and Radarr clients from
  `container` and runs `removeStalledDownloads` on both.
- **`QueueService`** (`@/integrations/arr/queue.types`):
  - `getQueue(): Promise<QueueResponse | undefined>`
  - `removeQueueItem(id: number, options: { blocklist: boolean; removeFromClient: boolean }): Promise<void>`
- **`QueueResponse`**: `{ records: QueueItem[]; totalRecords: number }`.
- **`QueueItem`**: `{ id, title, status, errorMessage?, statusMessages?: { title, messages }[], timeleft?, trackedDownloadStatus? }`.

## 5. Acceptance Criteria

- **AC-001 — Given** a queue item flagged `No files found are eligible for import`, **When** the cleanup job runs,
  **Then** `removeQueueItem` is called once with `{ blocklist: true, removeFromClient: true }` and an info log
  `Removing download: <title>` is emitted.
- **AC-002 — Given** an item stalled with no connections seen on five consecutive runs, **When** the fifth run
  completes, **Then** the item is removed and its strike entry is deleted.
- **AC-002b — Given** an item with `status='downloading'` and a missing/null `timeleft` seen on five consecutive
  runs, **When** the fifth run completes, **Then** the item is removed and its strike entry is deleted.
- **AC-003 — Given** an item that disappears from the queue before reaching 5 strikes, **When** the next run
  executes, **Then** its strike counter is purged from memory.
- **AC-003b — Given** a stalled Sonarr item and an empty Radarr queue, **When** five runs complete, **Then** the
  Sonarr item is removed — the Radarr pass must not evict Sonarr's counters.
- **AC-003c — Given** a stalled Sonarr item and a stalled Radarr item sharing the same queue id, **When** four runs
  complete, **Then** neither is removed — the two arrs must not double-count a single counter.
- **AC-004 — Given** a queue item missing `title` or `status`, **When** the cleanup job runs, **Then** it is logged
  with `warn` and never removed.

## 6. Test Automation Strategy

- Unit-test `removeStalledDownloads` against a fake `QueueService` covering: ineligible-files removal,
  dangerous-extension removal, strike accumulation up to threshold (both stalled-warning and no-download-speed
  paths), strike eviction on disappearance, cross-arr counter isolation (empty peer queue and colliding queue id),
  and malformed-item skip.
- Reset module state between cases (the strike map is module-scoped).
- Run via `bun run test`.

## 7. Rationale & Context

Stalled torrents and malformed releases routinely block arr queues. Radarr/Sonarr expose remediation only via the
queue API, so a polling job is the simplest reliable option. The strike threshold avoids removing items that
recover within a few minutes; the immediate removal for ineligible-files / dangerous-extension messages reflects
that those states never self-heal. Blocklisting on removal prevents the same release from being grabbed again.

Some torrent clients (e.g. Deluge in certain configurations) never report a stalled `status='warning'` to the arr
even when a download stops making progress. To catch those cases, the job also strikes items whose `timeleft` is
missing/null while `status='downloading'` — when there is no ETA, the effective download speed is null/zero. The
status guard prevents striking healthy `queued`, `paused`, or `completed` items that legitimately lack a `timeleft`.

## 8. Dependencies & External Integrations

### External Systems

- **EXT-001** Radarr `GET /api/v3/queue` and `DELETE /api/v3/queue/{id}` (v3 API).
- **EXT-002** Sonarr `GET /api/v3/queue` and `DELETE /api/v3/queue/{id}` (v3 API).

### Internal Dependencies

- **DEP-001** `@/integrations/arr` — `RadarrClient` and `SonarrClient` (both implement `QueueService`).
- **DEP-002** `@/providers/scheduler` — registers the cron job from `defineFeature({ jobs })`.
- **DEP-003** `@/core/runtime.service` — Sonarr and Radarr Effect services.
- **DEP-004** `@/config/logger` — tagged logging (`Cleanup`, `Sonarr` | `Radarr`).

## 9. Examples & Edge Cases

- Strike count persists only in-process; redeploys reset the window — acceptable since the job runs every 10 min.
- An item can satisfy both rules (ineligible-files _and_ stalled). The ineligible-files branch wins because it is
  evaluated together with the strike threshold in the same `if`, and the strike map entry is then cleared.
- If `getQueue` returns `undefined`, the loop iterates over `[]` and no removals or strikes happen for that arr.
- Strike eviction iterates that arr's own counter keys after the await — items removed during the pass are
  already deleted from the map and cannot leak.
- Radarr and Sonarr run concurrently over shared module state. Before per-arr scoping, each pass evicted every key
  absent from its own queue, so the two arrs wiped each other's strikes every run and no item ever passed 1 strike.

## 10. Validation Criteria

- `bun run check` and `bun run test` pass.
- The job appears in scheduler startup logs with pattern `0 */10 * * * *`.
- Manual smoke: induce a stalled torrent in Radarr, observe five strike logs over ~50 min, then a removal log and
  the item gone from `GET /queue`.

## 11. Related Specifications / Further Reading

- ../../../docs/architecture/feature_registration.spec.md
- ../../providers/scheduler/scheduler.spec.md
