---
title: Plex → Trakt watch history sync
status: amended
author: Antoine Bouteiller
date: 2026-04-17
related: [docs/specs/architecture.spec.md, docs/specs/persistence.spec.md, src/domains/media/media.spec.md, src/providers/telegram/telegram.spec.md]
---

## 2. Problem Statement

Plex tracks what has been watched locally; Trakt is the operator's long-lived watch history. Autoscan syncs newly
watched Plex items to Trakt twice a day, deduplicating by Plex `ratingKey` so the same episode isn't posted twice.
OAuth is bootstrapped from Telegram via Trakt's device-code flow.

- `[G-1]` Push Plex watched items (movies + episodes) to Trakt's `sync/history` endpoint.
- `[G-2]` Avoid duplicate posts via a dedicated `trakt_sync_history` table keyed by Plex `ratingKey`.
- `[G-3]` Manage Trakt OAuth tokens autonomously: refresh when near expiry, bootstrap via Telegram `/trakt`.
- `[G-4]` Provide manual trigger (`/synctrakt` in Telegram) in addition to the 12h cron.

## 3. Key Design Decisions

| Decision                     | Choice                                                                                 | Rationale                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `[KD-1]` Auth flow           | Trakt device-code flow initiated from Telegram                                         | No redirect URI needed; fits a single-user headless service                     |
| `[KD-2]` Token store         | `trakt_tokens` table, single row (`id` serial PK, but only one row used)               | Single-user service; simplest schema                                            |
| `[KD-3]` Refresh policy      | Refresh if `expiresAt < now + 300` (5 min skew)                                        | Avoids mid-sync expiry                                                          |
| `[KD-4]` Dedup               | `trakt_sync_history(plex_rating_key PK, synced_at)`; insert on successful sync         | Idempotent re-sync; small footprint                                             |
| `[KD-5]` TMDB resolution     | Extract `{tmdb-<id>}` token from Plex file path via regex                              | Radarr/Sonarr path templates include the TMDB ID; avoids a TMDB lookup per item |
| `[KD-6]` Show aggregation    | Build `Map<tmdbId, Show>` with nested seasons/episodes in-memory, then flatten         | Trakt's `sync/history` expects one entry per show with nested episodes          |
| `[KD-7]` Cadence             | Every 12h at minute 0 (`0 0 */12 * * *`)                                               | Matches other periodic tasks; not latency-sensitive                             |
| `[KD-8]` Device-code polling | Async IIFE in `traktAuthCommand`, polls every `interval` seconds until success/timeout | Bot thread stays free while user completes auth                                 |

## 4. Principles & Intents

- `[PI-1]` **Dedup before the API call** — items already in `trakt_sync_history` are never sent, even if Trakt would
  silently accept duplicates.
- `[PI-2]` **Mark as synced only after Trakt confirms** — `markManyAsSynced` runs after a successful
  `syncWatchedHistory` response.
- `[PI-3]` **Token refresh is transparent** — callers get a valid access token from `getValidAccessToken`, never
  handle refresh themselves.
- `[PI-4]` **Unresolved items are skipped silently** — missing viewCount, missing file path, missing `{tmdb-...}` →
  skip (no error, no strike).
- `[PI-5]` **watched_at precision** — derived from Plex `lastViewedAt` (Unix seconds → ISO); falls back to `now()` if
  missing.

## 5. Non-Goals

- `[NG-1]` Not a two-way sync — we do not pull Trakt data into Plex.
- `[NG-2]` No ratings, lists, or collection sync — only watched history.
- `[NG-3]` No multi-user Trakt account support.
- `[NG-4]` No retry queue for transient Trakt failures — failed sync logs; next cron retries untracked items.

## 6. Caveats

- `[C-1]` `trakt_tokens.id` is serial but the code assumes a single row (`limit(1)` + `upsertTokens` rewrites the
  existing id). Manual inserts could break this invariant.
- `[C-2]` `extractTmdbIdFromPath` requires the literal Plex path to contain `{tmdb-<id>}` — files renamed outside of
  Radarr/Sonarr won't sync.
- `[C-3]` `markManyAsSynced` uses `onConflictDoNothing` on the PK — failing to mark is a no-op, not a retry signal.
- `[C-4]` Device-code polling runs unbounded in the background — a user who abandons the prompt still consumes the
  full `expires_in` window before timing out.
- `[C-5]` Empty history pass short-circuits returning `{ movies: 0, episodes: 0 }` — no API call is made.

## 7. High-Level Components

| Component             | Module type                                                          | Responsibility                                           | Public API surface                                                                                       |
| --------------------- | -------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Sync service          | Module (`src/features/trakt_sync/services/plextraktsync.service.ts`) | Orchestration + token refresh + watched collection       | `syncPlexToTrakt()`, `getValidAccessToken()`, `collectWatchedItems(plex, syncedKeys)`                    |
| Trakt client          | Integration (`src/integrations/trakt/trakt.service.ts`)              | Trakt HTTP API                                           | `TraktClient` (`ITraktClient`): `getDeviceCode`, `pollDeviceToken`, `refreshToken`, `syncWatchedHistory` |
| Trakt repository      | Module (`src/features/trakt_sync/repositories/trakt.repository.ts`)  | Drizzle queries on `trakt_tokens` + `trakt_sync_history` | `getToken`, `upsertTokens`, `getSyncedRatingKeys`, `markManyAsSynced`                                    |
| Trakt job             | Module (`src/features/trakt_sync/jobs/trakt.job.ts`)                 | Cron entry                                               | `traktSyncJob()`                                                                                         |
| Telegram auth command | Module (`src/features/trakt_sync/commands/trakt.command.ts`)         | Device-code bootstrap + manual sync                      | `traktAuthCommand`, `syncTraktCommand`                                                                   |
| Feature register      | Module (`src/features/trakt_sync/register.ts`)                       | Wires cron + telegram commands                           | `registerTraktSync()`                                                                                    |
| Metadata utils        | Domain (`src/domains/media/services/metadata.service.ts`)            | Path parsing (shared with other features)                | `extractTmdbIdFromPath(filePath)`                                                                        |

## 8. Detailed Design

> Condensed after implementation. See source code for full detail.

| Component             | Module                                  | Entry point                                                 |
| --------------------- | --------------------------------------- | ----------------------------------------------------------- |
| Sync service          | `src/features/trakt_sync/services/`     | `plextraktsync.service.ts` (`syncPlexToTrakt`)              |
| Trakt client          | `src/integrations/trakt/`               | `trakt.service.ts` (`TraktClient`)                          |
| Trakt repository      | `src/features/trakt_sync/repositories/` | `trakt.repository.ts`                                       |
| Trakt job             | `src/features/trakt_sync/jobs/`         | `trakt.job.ts` (`traktSyncJob`)                             |
| Telegram auth command | `src/features/trakt_sync/commands/`     | `trakt.command.ts` (`traktAuthCommand`, `syncTraktCommand`) |
| Feature register      | `src/features/trakt_sync/`              | `register.ts` (`registerTraktSync`)                         |
| Metadata utils        | `src/domains/media/services/`           | `metadata.service.ts` (`extractTmdbIdFromPath`)             |

## 9. Verification Criteria

- `[VC-1]` `extractTmdbIdFromPath` parses `{tmdb-<id>}` from a Plex file path; returns undefined otherwise — **PASS** (`tests/services/metadata.service.spec.ts`).
- `[VC-2]` Already-synced Plex items are skipped — **PASS** (`tests/services/plextraktsync.service.spec.ts`).
- `[VC-3]` Movies and episodes are bucketed correctly into the Trakt payload shape — **PASS** (`tests/services/plextraktsync.service.spec.ts`).
- `[VC-4]` Expired tokens trigger a refresh; active tokens skip refresh — **PASS** (`tests/services/plextraktsync.service.spec.ts`).
- `[VC-5]` After a successful `syncWatchedHistory`, corresponding rating keys are inserted into `trakt_sync_history` — **PASS** (`tests/services/plextraktsync.service.spec.ts`).
- `[VC-6]` An empty collection returns `{ movies: 0, episodes: 0 }` without calling Trakt — **PASS** (`tests/services/plextraktsync.service.spec.ts`).
- `[VC-7.1]` `registerTraktSync()` attaches exactly: cron `Trakt Sync` (12h), `/trakt` command, `/synctrakt` command.

## 10. Open Questions

N/A

## Changelog

| Date       | Amendment                              | Sections affected | Reason                                                                                                        |
| ---------- | -------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| 2026-04-17 | Retarget metadata import to `#domains` | §7, §8            | `#media/metadata.service` → `#domains/media/services/metadata.service` per `project-structure.spec.md` [KD-5] |
