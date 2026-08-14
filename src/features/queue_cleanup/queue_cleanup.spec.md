---
title: Queue Cleanup
status: implemented
author: Antoine Bouteiller
date: 2026-08-14
related:
  - docs/project_structure.spec.md
  - docs/architecture/architecture.spec.md
  - src/providers/scheduler/scheduler.spec.md
---

## 2. Problem Statement

Stalled downloads and releases that cannot be imported occupy Radarr and Sonarr queues and prevent useful work from proceeding. The feature polls both queues, removes terminally unusable entries immediately, and removes persistently stalled entries after a bounded observation window.

- `[G-1]` Remove queue entries that are known to be unimportable.
- `[G-2]` Remove downloads that remain stalled across five cleanup passes without conflating Radarr and Sonarr state.
- `[G-3]` Bound removal pressure while processing both services concurrently.

## 3. Key Design Decisions

| Decision                     | Choice                                                                                                  | Rationale                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[KD-1]` Polling             | Register `Cleanup` on `*/10 * * * *`.                                                                   | Queue state originates in the arr services, so regular polling is required; the feature declares the ten-minute cadence (`src/features/queue_cleanup/feature.ts:6`).           |
| `[KD-2]` Immediate removal   | Remove entries reporting ineligible files or dangerous extensions with blocklisting and client removal. | These messages describe releases that cannot become importable, so waiting for additional passes only retains unusable work.                                                   |
| `[KD-3]` Stall threshold     | Maintain five strikes for stalled or downloading entries without `timeleft`.                            | A threshold allows transient stalls to recover while giving a deterministic removal point; the threshold is five (`src/features/queue_cleanup/services/cleanup.service.ts:6`). |
| `[KD-4]` State partition     | Key in-memory strikes by arr service, then queue id.                                                    | Queue ids are service-local, so service partitioning prevents equal ids and independent passes from corrupting each other's strike history.                                    |
| `[KD-5]` Removal concurrency | Share a four-permit semaphore across both arr passes.                                                   | A global bound protects the two remote queue APIs even though their scans run concurrently.                                                                                    |

## 4. Principles & Intents

- `[PI-1]` Conservative deletion — malformed entries are warned and never removed.
- `[PI-2]` Service symmetry — the common `QueueService` contract drives both arrs without per-arr policy branches.
- `[PI-3]` Complete-pass eviction — only a successful complete queue read may purge absent strike entries.

## 5. Non-Goals

- `[NG-1]` Retry searches or triage healthy downloads.
- `[NG-2]` Manage indexer-level blocklists beyond the arr removal request.
- `[NG-3]` Persist strike state across process restarts.

## 6. Caveats

- `[C-1]` Strike counters are process-local and reset when the process restarts.
- `[C-2]` A queue or removal failure fails that cleanup effect; the feature does not retry mutations.
- `[C-3]` Empty `title` or `status` values are logged as malformed and skipped.

## 7. High-Level Components

| Component       | Module type     | Responsibility                                                | Public API surface  |
| --------------- | --------------- | ------------------------------------------------------------- | ------------------- |
| Cleanup job     | Effect job      | Expose the scheduled cleanup workflow                         | `runCleanupProcess` |
| Cleanup service | Effect service  | Classify records, retain strikes, and remove eligible entries | `cleanupAll`        |
| Strike registry | In-memory state | Keep independent per-service queue-id strike counters         | internal map        |

## 8. Detailed Design

### Cleanup job

The job exports the service workflow and the feature scheduler invokes it under the `Cleanup` registration (`src/features/queue_cleanup/jobs/cleanup.job.ts:1`, `src/features/queue_cleanup/feature.ts:6`).

### Cleanup service

`cleanupAll` resolves Sonarr and Radarr, creates one four-permit semaphore, and runs their queue passes concurrently. Each pass reads its queue, logs and skips malformed records, then classifies remaining records. An entry is eligible immediately for either unimportable-files message; otherwise a stalled warning with the specified error or a downloading item with undefined `timeleft` gains one strike. At five strikes it is removed with `{ blocklist: true, removeFromClient: true }` (`src/features/queue_cleanup/services/cleanup.service.ts:40`, `src/features/queue_cleanup/services/cleanup.service.ts:66`).

Each successful pass removes strike entries absent from that same service's current ids. Successful removal also deletes its strike entry, so it cannot remain in memory.

### Strike registry

The registry is `Map<serviceName, Map<queueId, strikes>>`. It is deliberately in-memory and is accessed by each pass's service name, preserving independent counters for Radarr and Sonarr.

## 9. Open Questions

N/A
