---
title: Persistence (Drizzle + Postgres/PGlite)
status: condensed
author: Antoine Bouteiller
date: 2026-04-16
related: [docs/specs/architecture.spec.md, src/features/language-sync/language-sync.spec.md, src/features/trakt-sync/trakt-sync.spec.md]
---

## 2. Problem Statement

Autoscan needs to persist three things: (1) TMDB-derived per-media language metadata and the operator's language
override, (2) Trakt OAuth tokens, and (3) a dedup log of Plex rating keys already sent to Trakt. It must run the same
schema against a real Postgres in production and against an embedded PGlite for dev + tests.

- `[G-1]` Schema + queries portable between `node-postgres` and PGlite without code changes.
- `[G-2]` Auto-run pending migrations on boot.
- `[G-3]` Typed queries via Drizzle — no raw SQL in services.
- `[G-4]` In-memory PGlite for tests, file-backed PGlite for dev, Postgres for prod.

## 3. Key Design Decisions

| Decision                         | Choice                                                                                   | Rationale                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `[KD-1]` ORM                     | Drizzle with `pg-core` schema                                                            | Type-safe without runtime reflection; small footprint                                            |
| `[KD-2]` Backend                 | Dual: `drizzle-orm/node-postgres` for `postgres://` URLs, `drizzle-orm/pglite` otherwise | Same schema, chosen at boot from `DATABASE_URL`                                                  |
| `[KD-3]` Migrations              | Drizzle Kit SQL migrations in `./migrations/`, run at boot via `migrate()`               | Zero-touch deploys; failed migrations abort boot                                                 |
| `[KD-4]` `media` PK              | Composite `(tmdb_id, type)`                                                              | Same TMDB id can refer to a show or a movie; dedup at the correct grain                          |
| `[KD-5]` `media.type` enum       | `pgEnum('media_type', ['movie', 'show'])`                                                | Explicit allowed values; prevents drift between clients                                          |
| `[KD-6]` `trakt_sync_history` PK | `plex_rating_key`                                                                        | Plex's per-item ID is stable; guarantees idempotent insert via `onConflictDoNothing`             |
| `[KD-7]` `trakt_tokens` PK       | `id serial` (effectively single row)                                                     | The `upsertTokens` fn rewrites the single row; schema allows growth but isn't used               |
| `[KD-8]` PGlite path             | `DATABASE_URL === 'memory://'` → in-memory; otherwise filesystem path (auto-`mkdir`)     | Ephemeral for tests, persistent for dev                                                          |
| `[KD-9]` Init                    | Top-level `await` in `src/config/db.ts`                                                  | Module graph blocked until DB + migrations are ready; importers get a guaranteed-live connection |

## 4. Principles & Intents

- `[PI-1]` **Repositories are thin** — repos contain Drizzle calls, no business logic.
- `[PI-2]` **Queries return Drizzle-inferred types** — no manual DTO mapping. `Media = typeof media.$inferSelect`.
- `[PI-3]` **Upsert via `onConflictDoUpdate`/`onConflictDoNothing`** — never "select-then-insert" with a race window.
- `[PI-4]` **Transactions for multi-row inserts** — `markManyAsSynced` wraps a loop in `db.transaction(...)`.
- `[PI-5]` **One `db` instance per process** — exported from `src/config/db.ts`; never reconstructed.

## 5. Non-Goals

- `[NG-1]` No multi-tenant isolation (no schemas, no row-level security).
- `[NG-2]` No soft-delete — rows are deleted or left alone.
- `[NG-3]` No migration rollback — forward-only.
- `[NG-4]` No connection pool tuning exposed — accept library defaults. (Note: session S506/S511 flagged default
  `pg.Pool` behavior as a memory concern; pool config is left at Drizzle/pg defaults.)
- `[NG-5]` No support for databases beyond Postgres-compatible (no SQLite — the SQLite experiment from observation
  2850-2855 was reverted).

## 6. Caveats

- `[C-1]` Top-level `await` in `src/config/db.ts` means any module that imports `#config/db` pays the migration cost
  at import time. Tests must set `DATABASE_URL='memory://'`.
- `[C-2]` `pgEnum` works on PGlite because it implements the Postgres type system; swapping to SQLite would break
  the enum.
- `[C-3]` The initial migration `20260315090840_rich_morbius` created `media.type` as plain `text`; the second
  migration `20260321191235_shallow_layla_miller` converted it to `media_type` enum with USING cast.
- `[C-4]` `trakt_tokens.id` is `serial` but only one logical row ever exists — inserts by hand could create a second
  row that `getToken().limit(1)` would silently hide.
- `[C-5]` `media.tmdb_id` and `media.type` were created as nullable columns in the initial SQL migration despite the
  schema declaring them `notNull()` — the types enforce non-null at write time only.

## 7. High-Level Components

| Component        | Module type                                                                 | Responsibility                                                                      | Public API surface                                                                                     |
| ---------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| DB init          | Module (`src/config/db.ts`)                                                 | Dual-backend init + auto-migrate                                                    | `db: NodePgDatabase \| PgliteDatabase`                                                                 |
| Schema           | Module (`src/database/schema.ts`)                                           | Drizzle table definitions                                                           | `media`, `traktTokens`, `traktSyncHistory`, `mediaTypeEnum`, `Media`, `TraktToken`, `TraktSyncHistory` |
| Media repository | Shared module (`src/shared/media.repository.ts`)                            | Drizzle queries on `media` (consumed by multiple features)                          | `getMediaByIdAndType`, `createdOrUpdatedMedia`, `getMediaByTypeWithPagination`, `countMediaByType`     |
| Trakt repository | Feature module (`src/features/trakt-sync/repositories/trakt.repository.ts`) | Drizzle queries on `trakt_tokens` + `trakt_sync_history` (single feature owns them) | `getToken`, `upsertTokens`, `getSyncedRatingKeys`, `markManyAsSynced`                                  |
| Drizzle config   | `drizzle.config.ts` at repo root                                            | Pins schema + migration dir for Drizzle Kit CLI                                     | —                                                                                                      |
| Migrations       | `./migrations/*/migration.sql`                                              | SQL migrations (Drizzle Kit)                                                        | `20260315090840_rich_morbius`, `20260321191235_shallow_layla_miller`                                   |
| ISO code enum    | Module (`src/shared/types/iso_codes.ts`)                                    | `ISO1` array used as Drizzle `text({ enum })` values                                | `ISO1`, `ISOCode1`, `iso1ToIso2T`                                                                      |

## 8. Detailed Design

> Condensed after implementation. See source code for full detail.

| Component        | Module                                                     | Entry point                                                                                        |
| ---------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| DB init          | `src/config/db.ts`                                         | `export const db = await initDatabase()`                                                           |
| Schema           | `src/database/schema.ts`                                   | `media`, `traktTokens`, `traktSyncHistory`, `mediaTypeEnum` + inferred types                       |
| Media repository | `src/shared/media.repository.ts`                           | `getMediaByIdAndType`, `createdOrUpdatedMedia`, `getMediaByTypeWithPagination`, `countMediaByType` |
| Trakt repository | `src/features/trakt-sync/repositories/trakt.repository.ts` | `getToken`, `upsertTokens`, `getSyncedRatingKeys`, `markManyAsSynced`                              |
| Drizzle config   | `drizzle.config.ts`                                        | Pins schema + migration dir for Drizzle Kit CLI                                                    |
| Migrations       | `migrations/`                                              | `20260315090840_rich_morbius/`, `20260321191235_shallow_layla_miller/`                             |
| ISO code enum    | `src/shared/types/iso_codes.ts`                            | `ISO1`, `ISOCode1`, `iso1ToIso2T`                                                                  |
| Test harness     | `tests/env.ts`, `tests/setup.ts`, `tests/utils.ts`         | `DATABASE_URL='memory://'`; single-fork PGlite shared across tests                                 |

## 9. Verification Criteria

- `[VC-1]` `getMediaByIdAndType` returns `undefined` for unknown keys — **PASS** (`tests/repositories/media.repository.spec.ts`).
- `[VC-2]` `createdOrUpdatedMedia` inserts new rows and updates existing ones on `(tmdbId, type)` conflict — **PASS** (`tests/repositories/media.repository.spec.ts`).
- `[VC-3]` `getMediaByTypeWithPagination` respects `offset`/`limit`, orders by `title` — **PASS** (`tests/repositories/media.repository.spec.ts`).
- `[VC-4]` `countMediaByType` returns the right count per type — **PASS** (`tests/repositories/media.repository.spec.ts`).
- `[VC-5]` `upsertTokens` inserts on first call, updates the single row afterward — **PASS** (`tests/services/plextraktsync.service.spec.ts`).
- `[VC-6]` `markManyAsSynced` is idempotent via `onConflictDoNothing` — **PASS** (`tests/services/plextraktsync.service.spec.ts`).
- `[VC-7]` Both backends (PGlite in tests, Postgres in prod) compile against the same schema — type-check (`vp check`).

## 10. Open Questions

N/A
