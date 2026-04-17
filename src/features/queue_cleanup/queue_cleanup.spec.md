---
title: Radarr/Sonarr queue cleanup
status: condensed
author: Antoine Bouteiller
date: 2026-04-16
related: [docs/specs/architecture.spec.md]
---

## 2. Problem Statement

Radarr and Sonarr occasionally end up with downloads stuck in their import queue — either stalled with no connections
or holding a file the application refuses to import. Left alone, these pin disk slots and slow the download client.
Autoscan periodically inspects both queues and removes rotten items, blocklisting them so the downloader won't
re-grab the same release.

- `[G-1]` Remove queue items whose import is permanently stuck (no eligible files, dangerous extensions).
- `[G-2]` Remove items stalled with no connections after 5 consecutive observations (`STRIKE_COUNT`).
- `[G-3]` Apply the same policy to both Radarr and Sonarr via a shared `QueueService` interface.
- `[G-4]` Blocklist + remove-from-client so the release is not re-downloaded.

## 3. Key Design Decisions

| Decision                     | Choice                                                                                                    | Rationale                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `[KD-1]` Cadence             | Every 10 minutes (`0 */10 * * * *`)                                                                       | Matches the frequency at which Radarr/Sonarr internally re-try imports |
| `[KD-2]` Strike accounting   | Module-level `Map<itemId, count>` — stall increments, absence-from-queue deletes                          | No DB state — stalls that resolve get forgotten on next pass           |
| `[KD-3]` Strike threshold    | `STRIKE_COUNT = 5` → ~50 min of continuous stall                                                          | Avoids killing transient stalls; aggressive enough to free slots       |
| `[KD-4]` Immediate removal   | Items with `"No files found are eligible for import"` or `"Caution: Found potentially dangerous file..."` | These are terminal — retrying is futile                                |
| `[KD-5]` Removal mode        | `{ blocklist: true, removeFromClient: true }`                                                             | Ensures Radarr/Sonarr grab a different release next time               |
| `[KD-6]` Service abstraction | Both clients implement `QueueService` (`getQueue` + `removeQueueItem`)                                    | Cleanup service is client-agnostic                                     |

## 4. Principles & Intents

- `[PI-1]` **Stateless across restarts** — strike counts are intentionally in-memory.
- `[PI-2]` **Parallel across services** — Radarr and Sonarr cleanups run via `Promise.all`.
- `[PI-3]` **Defensive against malformed items** — items missing `title` or `status` are skipped with a warning.
- `[PI-4]` **Forget stale IDs** — each pass prunes the strike map of IDs no longer in the queue.

## 5. Non-Goals

- `[NG-1]` Not a generic download-client manager — we only talk to Radarr/Sonarr's queue API.
- `[NG-2]` No manual trigger surface (HTTP or Telegram) — cron-only.
- `[NG-3]` No notification on removal — logs only.
- `[NG-4]` No configuration of strike threshold — hard-coded `STRIKE_COUNT = 5`.

## 6. Caveats

- `[C-1]` Strike counts reset on process restart — a download stuck through a restart gets a fresh 5-observation
  window.
- `[C-2]` The strike condition is keyed on the exact Radarr/Sonarr error string
  `'The download is stalled with no connections'` — translation/upstream text changes would silently break this.
- `[C-3]` "No eligible files" and "dangerous file" matches are substring-level; upstream phrasing changes also break.
- `[C-4]` `statusMessages` is optional on the Radarr/Sonarr response — absent arrays are handled but
  `item.statusMessages.flatMap(...)` assumes the array of `{ messages }` is well-formed.

## 7. High-Level Components

| Component        | Module type                                                       | Responsibility                                      | Public API surface                                               |
| ---------------- | ----------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Cleanup service  | Module (`src/features/queue_cleanup/services/cleanup.service.ts`) | Per-service stall detection + removal orchestration | `cleanupAll()`                                                   |
| Cleanup job      | Module (`src/features/queue_cleanup/jobs/cleanup.job.ts`)         | Cron entry point                                    | `runCleanupProcess()`                                            |
| Feature register | Module (`src/features/queue_cleanup/register.ts`)                 | Wires cron to SchedulerProvider                     | `registerQueueCleanup()`                                         |
| Queue contract   | Type (`src/integrations/arr/queue.types.ts`)                      | Shared shape for Radarr/Sonarr queue behavior       | `QueueService`, `QueueResponse`, `queueResponseValidator`        |
| Radarr client    | Class (`src/integrations/arr/radarr.service.ts`)                  | Radarr API client                                   | `RadarrClient` (implements `IRadarrClient extends QueueService`) |
| Sonarr client    | Class (`src/integrations/arr/sonarr.service.ts`)                  | Sonarr API client                                   | `SonarrClient` (implements `ISonarrClient extends QueueService`) |
| Arr base         | Class (`src/integrations/arr/arr.service.ts`)                     | Shared HTTP client + queue endpoints                | `ArrClient.getQueue()`, `ArrClient.removeQueueItem(id, options)` |

## 8. Detailed Design

> Condensed after implementation. See source code for full detail.

| Component        | Module                                                   | Entry point                                       |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------- |
| Cleanup service  | `src/features/queue_cleanup/services/cleanup.service.ts` | `cleanupAll()`                                    |
| Cleanup job      | `src/features/queue_cleanup/jobs/cleanup.job.ts`         | `runCleanupProcess()`                             |
| Feature register | `src/features/queue_cleanup/register.ts`                 | `registerQueueCleanup()`                          |
| Queue contract   | `src/integrations/arr/queue.types.ts`                    | `QueueService`, `queueResponseValidator`          |
| Radarr client    | `src/integrations/arr/radarr.service.ts`                 | `RadarrClient`                                    |
| Sonarr client    | `src/integrations/arr/sonarr.service.ts`                 | `SonarrClient`                                    |
| Arr base         | `src/integrations/arr/arr.service.ts`                    | `ArrClient.getQueue`, `ArrClient.removeQueueItem` |

## 9. Verification Criteria

- `[VC-1]` Items with `No files found are eligible for import` are removed on the first pass — **PASS** (`tests/services/cleanup.service.spec.ts`).
- `[VC-2]` Items with `dangerous file with extension` are removed on the first pass — **PASS** (`tests/services/cleanup.service.spec.ts`).
- `[VC-3]` Stalled items are not removed until 5 consecutive observations — **PASS** (`tests/services/cleanup.service.spec.ts`).
- `[VC-4]` `removeQueueItem` is called with `{ blocklist: true, removeFromClient: true }` — **PASS** (`tests/services/cleanup.service.spec.ts`).
- `[VC-5]` Items absent from a subsequent queue fetch are pruned from `strikeCounts`.
- `[VC-6]` Items missing `title` or `status` are skipped without throwing — **PASS** (`tests/services/cleanup.service.spec.ts`).
- `[VC-7.1]` `registerQueueCleanup()` attaches exactly: cron `Cleanup` (every 10 minutes).

## 10. Open Questions

N/A.
