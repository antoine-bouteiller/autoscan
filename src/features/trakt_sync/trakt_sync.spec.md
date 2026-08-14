---
title: Trakt Sync
status: implemented
author: Antoine Bouteiller
date: 2026-08-14
related:
  - docs/project_structure.spec.md
  - docs/architecture/architecture.spec.md
  - src/providers/scheduler/scheduler.spec.md
  - src/providers/telegram/telegram.spec.md
  - src/domains/media/media.spec.md
---

## 2. Problem Statement

Watched Plex movies and episodes need to appear in one Trakt account without repeatedly submitting the same Plex items. The feature synchronizes Plex watch history on a schedule, maintains OAuth credentials, and lets the operator authorize or initiate the sync through Telegram.

- `[G-1]` Submit unsynced watched Plex movies and episodes to Trakt history.
- `[G-2]` Keep one usable Trakt OAuth token set, refreshing it before expiry.
- `[G-3]` Make per-rating-key history submission idempotent.
- `[G-4]` Provide Telegram authorization and manual synchronization controls.

## 3. Key Design Decisions

| Decision                       | Choice                                                                                 | Rationale                                                                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[KD-1]` Direction and cadence | Run Plex-to-Trakt sync on `0 */12 * * *`.                                              | Plex is the watch-history source and the feature registration establishes a periodic, bounded API workload (`src/features/trakt_sync/feature.ts:11`).              |
| `[KD-2]` Idempotency key       | Persist submitted Plex `ratingKey` values.                                             | The rating key is Plex's item identity, so it filters repeat runs before a Trakt request.                                                                          |
| `[KD-3]` Token refresh         | Refresh when expiry is less than five minutes away and overwrite the single token row. | Refresh leeway avoids beginning a remote synchronization with a token likely to expire during it (`src/features/trakt_sync/services/plextraktsync.service.ts:18`). |
| `[KD-4]` Watch payload         | Submit movies by TMDB id and episodes grouped into show seasons with `watched_at`.     | This matches Trakt history's media model while retaining Plex's viewing timestamp.                                                                                 |
| `[KD-5]` OAuth execution       | Run device-code polling in one keyed scoped task per chat.                             | Per-chat admission prevents duplicate polling while scope ownership prevents detached authorization work.                                                          |

## 4. Principles & Intents

- `[PI-1]` One-way history — Plex supplies watch state; Trakt does not alter Plex.
- `[PI-2]` Mark only after submission — sync history is recorded only after Trakt accepts the payload.
- `[PI-3]` Typed failure visibility — remote and persistence failures are logged and remain available to job or command handling.

## 5. Non-Goals

- `[NG-1]` Scrobbling, ratings, collection synchronization, or reverse Trakt-to-Plex synchronization.
- `[NG-2]` Support multiple Trakt accounts.
- `[NG-3]` Submit episodes lacking season or episode numbering.

## 6. Caveats

- `[C-1]` Media with no path, no TMDB id in its path, no view count, or an already-synced rating key is skipped.
- `[C-2]` A missing token yields `TraktTokenExpiredError`; synchronization does not mark history.
- `[C-3]` Missing `lastViewedAt` uses the time of collection as `watched_at`.

## 7. High-Level Components

| Component            | Module type       | Responsibility                                                  | Public API surface         |
| -------------------- | ----------------- | --------------------------------------------------------------- | -------------------------- |
| Trakt sync job       | Effect job        | Run and log scheduled synchronization                           | `traktSyncJob`             |
| Sync service         | Effect service    | Refresh tokens, collect watched items, submit, and mark history | `syncPlexToTrakt`          |
| Trakt repository     | Database Effects  | Manage token and rating-key records                             | token/history functions    |
| Telegram commands    | Telegram commands | Device authorization and manual sync                            | `/trakt`, `/synctrakt`     |
| Authentication tasks | Scoped service    | Serialize device-code polling per chat                          | `TraktAuthenticationTasks` |

## 8. Detailed Design

### Trakt sync job and service

The job runs `syncPlexToTrakt` and logs non-interruption failures (`src/features/trakt_sync/jobs/trakt.job.ts:5`). The service obtains a valid token, reads synced keys, traverses Plex sections, and collects watched movies and episodes. It ignores unviewed or unidentifiable media, groups episodes by show and season, short-circuits an empty payload, submits history, then marks submitted keys (`src/features/trakt_sync/services/plextraktsync.service.ts:93`, `src/features/trakt_sync/services/plextraktsync.service.ts:103`).

### Token and history repository

`getToken` returns the single stored token if present. A token valid for at least 300 seconds is used directly; otherwise refresh results overwrite the token values. `markManyAsSynced` de-duplicates keys and inserts them with conflict suppression, retaining idempotency under repeat work (`src/features/trakt_sync/repositories/trakt.repository.ts:28`).

### Telegram commands and authentication tasks

`/trakt` reports an existing usable token or requests a Trakt device code, sends its verification information, and starts scoped polling keyed by chat id. A successful poll persists the token and reports success; expiry or a non-retryable failure reports failure. `/synctrakt` acknowledges, runs synchronization, and replies with the added movie and episode counts or the failure message (`src/features/trakt_sync/commands/trakt.command.ts:80`).

## 9. Open Questions

N/A
