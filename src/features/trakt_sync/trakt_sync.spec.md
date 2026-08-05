---
title: Trakt Sync Feature
version: 1.0
date_created: 2026-05-08
last_updated: 2026-05-08
tags: [feature, trakt, plex, telegram, scheduler, oauth]
---

# Introduction

Push Plex watch history to Trakt.tv on a schedule, with OAuth bootstrap driven from Telegram and
per-rating-key idempotency persisted in PostgreSQL.

## 1. Purpose & Scope

- Mirror Plex `viewCount > 0` items (movies, episodes) into Trakt's `sync/history`.
- Persist Trakt OAuth tokens (access + refresh) in `trakt_tokens` and refresh proactively before expiry.
- Track already-synced Plex rating keys in `trakt_sync_history` to make every run idempotent.
- Out of scope: scrobbling, ratings, collection sync, reverse sync (Trakt -> Plex).

## 2. Definitions

- **ratingKey**: Plex's stable per-item identifier (string), used as the idempotency key.
- **OAuth device code flow**: user-facing flow where Trakt issues `user_code` + `verification_url`;
  client polls `oauth/device/token` until the user authorizes.
- **Watch history**: Trakt `sync/history` endpoint accepting movies + nested shows/seasons/episodes
  with `watched_at` timestamps.
- **TMDB id**: media identifier extracted from the Plex file path (`extractTmdbIdFromPath`).

## 3. Requirements, Constraints & Guidelines

- **REQ-001** Run `syncPlexToTrakt` on cron `0 0 */12 * * *` (every 12 hours, top of hour) under
  job name `Trakt Sync`. Direction is Plex -> Trakt only.
- **REQ-002** Persist `(accessToken, refreshToken, expiresAt)` as a single row in `trakt_tokens`.
  Refresh when `expiresAt < now + 300s` (5-minute leeway) and overwrite the row in place.
- **REQ-003** Skip any `ratingKey` already present in `trakt_sync_history`. After a successful
  Trakt push, insert all submitted rating keys with `onConflictDoNothing`.
- **REQ-004** Expose `/trakt` (OAuth bootstrap) and `/synctrakt` (manual run) Telegram commands.
- **REQ-005** Resolve TMDB id from the Plex file path; items without a resolvable TMDB id are
  skipped silently.
- **CON-001** A single Trakt account is supported (one row in `trakt_tokens`).
- **CON-002** Episodes without `parentIndex` (season) or `index` (episode number) are skipped.
- **CON-003** Movies are submitted by TMDB id only; shows nest seasons + episodes with `watched_at`.
- **GUD-001** All Trakt and Plex calls return tagged errors; surface them via `logError` and bubble
  the original error up so the job logs and the command reply both reflect the failure.
- **PAT-001** Repository functions are module-level Effects over the Database service, not a class.
- **PAT-002** OAuth polling runs in one scoped keyed fiber per chat id so the command returns idle immediately without unowned work.

## 4. Interfaces & Data Contracts

### Scheduled job

| Name         | Pattern          | Handler                             |
| ------------ | ---------------- | ----------------------------------- |
| `Trakt Sync` | `0 0 */12 * * *` | `traktSyncJob` -> `syncPlexToTrakt` |

### Telegram commands

| Command      | Handler            | Conversation                                                                                                                                                                                                                                                                                                                                                   |
| ------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/trakt`     | `traktAuthCommand` | If a valid token already exists, reply "Already authentified.". Otherwise call `getDeviceCode`, post `verification_url` + `user_code` (Markdown), then poll `pollDeviceToken` every `interval` seconds until `expires_in` elapses. On success, persist tokens and reply success; on timeout / non-400 error, reply failure. Always returns `{ step: 'idle' }`. |
| `/synctrakt` | `syncTraktCommand` | Acknowledge "Starting Trakt sync...", run `syncPlexToTrakt`, reply `*Trakt Sync Summary*` with `Movies added` / `Episodes added` (Markdown) on success or `Trakt sync failed: <message>` on error.                                                                                                                                                             |

### Service API (`services/plextraktsync.service.ts`)

- `getValidAccessToken` is an Effect that returns a usable token and keeps refresh/database failures typed.
- `collectWatchedItems(plexClient, syncedKeys)` is an Effect that returns `{ movies, shows, ratingKeysToMark }`.
- `syncPlexToTrakt` composes token lookup, Plex collection, Trakt push, and persistence as one Effect.

### Repository API (`repositories/trakt.repository.ts`)

- `getToken` returns an Effect succeeding with `TraktToken | undefined`.
- `upsertTokens(accessToken, refreshToken, expiresAt)` is a typed database Effect.
- `getSyncedRatingKeys` returns an Effect succeeding with `Set<string>`.
- `markManyAsSynced(ratingKeys)` runs one transaction with `onConflictDoNothing`.

### Database tables

`trakt_tokens`:

| Column          | Type               | Notes                     |
| --------------- | ------------------ | ------------------------- |
| `id`            | `serial` PK        | always one row            |
| `access_token`  | `text NOT NULL`    | bearer for `sync/history` |
| `refresh_token` | `text NOT NULL`    | used at `oauth/token`     |
| `expires_at`    | `integer NOT NULL` | unix seconds              |

`trakt_sync_history`:

| Column            | Type                 | Notes                     |
| ----------------- | -------------------- | ------------------------- |
| `plex_rating_key` | `text` PK            | Plex `ratingKey` (string) |
| `synced_at`       | `timestamp NOT NULL` | wall clock at insert      |

### Errors

- `TraktTokenExpiredError` — raised by `getValidAccessToken` when `trakt_tokens` is empty; signals
  the user must run `/trakt`.
- All `TraktClient` / `PlexClient` calls may also return `HttpError | NetworkError | ValidationError`.

## 5. Acceptance Criteria

- **AC-001** With valid tokens, the cron run pushes new movies + episodes to Trakt and inserts each
  submitted `ratingKey` into `trakt_sync_history`.
- **AC-002** A second run immediately after produces `{ movies: 0, episodes: 0 }` and writes nothing
  new to the database.
- **AC-003** When `expiresAt < now + 300`, `getValidAccessToken` calls `refreshToken`, persists the
  new token triple, and proceeds without user interaction.
- **AC-004** When `trakt_tokens` is empty, `syncPlexToTrakt` returns `TraktTokenExpiredError` and the
  command/job reply contains the error message; nothing is written to `trakt_sync_history`.
- **AC-005** `/trakt` polls device authorization until success, expiry, or a non-400 HTTP error;
  on success the token row is created.
- **AC-006** Items with `viewCount === 0`, missing file path, or unresolved TMDB id are skipped and
  not marked as synced.

## 6. Test Automation Strategy

- Unit-test `processWatchedItem`, `processMovie`, `processEpisode` against fixture `PlexMedia`
  values (already-synced, no view, missing tmdb, episode without season/index, movie, episode).
- Provide local Plex and Trakt layers; assert the `syncWatchedHistory` payload and persisted rating keys.
- Cover `getValidAccessToken` token-refresh branch (expired, near-expiry, valid).
- Test `/trakt` happy path and 400-keep-polling branch with a fake `traktClient`.

## 7. Rationale & Context

- 12h cadence keeps Trakt history near-current without hammering the Plex library scan.
- 300s refresh leeway avoids using a token that expires mid-request.
- Per-`ratingKey` history (rather than per-(tmdbId, episode)) aligns with Plex's identity model and
  prevents re-pushing if a user re-watches an item (Plex bumps `lastViewedAt` but the key is stable).
- `/trakt` starts one scoped `FiberMap` task per authorized chat id so handlers return promptly without detached work.

## 8. Dependencies & External Integrations

### External Systems

- **EXT-001** Trakt.tv REST API at `https://api.trakt.tv` — `oauth/device/code`, `oauth/device/token`,
  `oauth/token`, `sync/history`. Requires `clientId` + `clientSecret`, `trakt-api-version: 2`.
- **EXT-002** Plex Media Server — `library/sections`, `library/sections/{id}/all` filtered by
  `type=1` (movies) or `type=4` (episodes). Authenticated via `X-Plex-Token`.
- **EXT-003** PostgreSQL — `trakt_tokens`, `trakt_sync_history` tables managed by Drizzle.

### Internal Dependencies

- **DEP-001** `@/integrations/trakt` (TraktClient), `@/integrations/plex` (PlexClient).
- **DEP-002** `@/database`, `@/config/db` — Drizzle schema + connection.
- **DEP-003** `@/providers/scheduler` — cron registration via `defineFeature.jobs`.
- **DEP-004** `@/providers/telegram` — command registration via `defineFeature.commands`.
- **DEP-005** `@/domains/media/services/metadata.service` (`extractTmdbIdFromPath`).
- **DEP-006** `@/core/runtime.service` for Trakt, Plex, and Database services.

## 9. Examples & Edge Cases

- Plex returns an episode with `parentIndex = 2`, `index = 5`, TMDB id `1399` -> Trakt receives
  `{ ids: { tmdb: 1399 }, seasons: [{ number: 2, episodes: [{ number: 5, watched_at }] }] }`.
- Same episode on next run -> filtered out by `syncedKeys`, never reaches Trakt.
- Refresh token revoked by user on Trakt -> `refreshToken` returns `HttpError`, surfaced to the
  job log; the command reply tells the user to re-auth via `/trakt`.
- Plex `lastViewedAt` missing -> `watched_at` falls back to `new Date().toISOString()`.
- `movies.length === 0 && shows.length === 0` -> short-circuits to `{ movies: 0, episodes: 0 }`
  with no Trakt call and no DB write.

## 10. Validation Criteria

- `bun run check` and `bun run test` pass.
- After running `/synctrakt`, `select count(*) from trakt_sync_history` increases by exactly the
  number of unique rating keys submitted.
- `select count(*) from trakt_tokens` is always 0 or 1.
- Trakt's "Watched" view shows the items pushed in the run.

## 11. Related Specifications / Further Reading

- ../../../docs/architecture/feature_registration.spec.md
- ../../providers/scheduler/scheduler.spec.md
- ../../providers/telegram/telegram.spec.md
