---
title: Media Domain
version: 1.0
date_created: 2026-05-08
last_updated: 2026-05-08
tags: [domain, media, persistence]
---

# Introduction

The `media` domain owns the cross-feature persistence of catalogued media items and their language preferences. It exposes a repository over the `media` table and a metadata service that enriches items via TMDB and Plex.

## 1. Purpose & Scope

- Single source of truth for `(tmdbId, type)` tuples and their `originalLanguage` / `preferredLanguage`.
- Hosts reusable orchestration: extract `tmdbId` from Plex file paths, resolve language via TMDB, assemble Plex metadata into a usable shape.
- Out of scope: feature-specific business rules (sync triggers, scoring, transcoding decisions).

## 2. Definitions

- **tmdbId**: TMDB integer identifier; primary correlation key across Plex, Radarr, Sonarr.
- **ratingKey**: Plex internal item id; resolved to `tmdbId` via the file path token `{tmdb-<id>}`.
- **ISO 639-1**: 2-letter language code; the only language representation persisted (`ISO1` enum).
- **mediaTypeEnum**: PostgreSQL enum, values `'movie' | 'show'`.
- **Composite PK**: `(tmdbId, type)` — same id may exist as both movie and show.

## 3. Requirements, Constraints & Guidelines

- **REQ-001**: The `media` table MUST use `(tmdbId, type)` as a composite primary key (`media_tmdb_id_type_pk`).
- **REQ-002**: `originalLanguage` and `preferredLanguage` MUST be constrained to the `ISO1` set (Drizzle `text({ enum: ISO1 })`).
- **REQ-003**: The repository exposes: `countMediaByType`, `createdOrUpdatedMedia`, `getMediaByIdAndType`, `getMediaByTypeWithPagination`. No other module performs direct writes against `media`.
- **REQ-004**: `metadata.service` MUST resolve language with cache-first semantics (DB hit short-circuits TMDB) and persist via the repository on TMDB hit.
- **REQ-005**: `metadata.service` defaults to `'en' / 'en'` when TMDB returns no data; nothing is persisted in that case.
- **CON-001**: This domain MUST NOT import from `@/features/*`, `@/providers/*`, or sibling domains.
- **CON-002**: Allowed dependencies: `@/shared`, `@/config`, `@/database`, `@/integrations`, and Effect service keys from `@/core/runtime.service`.
- **CON-003**: `preferredLanguage` is initialised to `originalLanguage` on insert/upsert; future divergence is a feature concern (language_sync), not a domain concern.
- **GUD-001**: Repository functions return Effects with typed database failures and an explicit `Database` requirement.
- **PAT-001**: Errors are `Data.TaggedError` classes from `errors.ts` and remain in the Effect error channel.

## 4. Interfaces & Data Contracts

### Drizzle schema (`@/database/schema`)

| Column            | Type                   | Notes                        |
| ----------------- | ---------------------- | ---------------------------- |
| tmdbId            | `integer('tmdb_id')`   | PK part                      |
| type              | `mediaTypeEnum`        | PK part, `'movie' \| 'show'` |
| title             | `text`                 | not null                     |
| originalLanguage  | `text({ enum: ISO1 })` | not null                     |
| preferredLanguage | `text({ enum: ISO1 })` | not null                     |

### Repository (`repositories/media.repository.ts`)

- `countMediaByType(type)` — returns row count for a given media type.
- `createdOrUpdatedMedia({ tmdbId, type, title, originalLanguage })` — upsert on `(tmdbId, type)`; sets `preferredLanguage = originalLanguage` and updates `title` / `originalLanguage` on conflict.
- `getMediaByIdAndType(tmdbId, type)` — returns the row or `undefined`.
- `getMediaByTypeWithPagination(type, page, pageSize)` — ordered by `title asc`, offset/limit pagination.

### Metadata service (`services/metadata.service.ts`)

- `extractTmdbIdFromPath(filePath)` — parses `{tmdb-<id>}`, returns `number | undefined`.
- `buildMediaTitle(grandparentTitle?, parentTitle?, title?)` — joins defined parts with `-`.
- `getMediaLanguage(tmdbId, mediaType)` — DB cache → TMDB fallback → upsert; defaults to `en` on TMDB miss.
- `getCompleteMediaDetails(ratingKey)` — Plex lookup, file-path tmdbId extraction, language resolution; returns `{ file, mediaTitle, mediaType, originalLanguage, preferredLanguage, partsId, streams, tmdbId }` or a tagged error.

### Errors (`errors.ts`)

- `FileNotFoundError` — Plex item has no `Media[0].Part[0]` file.
- `TmdbIdNotFoundError` — file path lacks the `{tmdb-<id>}` token.

## 5. Acceptance Criteria

- **AC-001**: Given an existing `(tmdbId, type)` row, when `getMediaByIdAndType` runs, then the row is returned; otherwise `undefined`.
- **AC-002**: Given `getMediaLanguage` is called for an unknown id, when TMDB returns data, then `createdOrUpdatedMedia` is called and the resolved language is returned.
- **AC-003**: Given `createdOrUpdatedMedia` is called with a code outside `ISO1`, then the database rejects the write via the `text` enum constraint.
- **AC-004**: Given `getCompleteMediaDetails` runs against an episode, then `mediaType` is normalised to `'show'`.
- **AC-005**: Given a Plex file path without a `{tmdb-<id>}` token, then `getCompleteMediaDetails` returns a `TmdbIdNotFoundError`.

## 6. Test Automation Strategy

- Unit-test pure helpers (`extractTmdbIdFromPath`, `buildMediaTitle`) against representative path fixtures.
- Provide local TMDB and Plex test layers to cover cache hits, TMDB misses, missing files, missing ids, and episode normalization.
- Repository tests run against the shared Postgres testcontainer under `bun:test`.

## 7. Rationale & Context

Promoted to a domain because the language store is read by `language_sync` and the title/path helpers are reused by `transcoding`; combined with the TMDB integration, this clears the "2 features + 1 integration" bar in the project rule. Keeping the upsert and TMDB enrichment together avoids each consumer reinventing the cache-first lookup and re-implementing path parsing.

## 8. Dependencies & External Integrations

### External Systems

- **EXT-001**: TMDB API — language and title source.
- **EXT-002**: Plex API — ratingKey → metadata, file path source.

### Internal Dependencies

- **DEP-001**: `@/database` (Drizzle schema, types).
- **DEP-002**: `@/integrations/tmdb` (TMDB client interface).
- **DEP-003**: `@/integrations/plex` (Plex client interface, `MediaType`).
- **DEP-004**: `@/config/db` (scoped database layer).
- **DEP-005**: `@/core/runtime.service` (Database, TMDB, and Plex services).
- **DEP-006**: `@/shared/types/iso_codes` (`ISO1`, `ISOCode1`).

### Data Dependencies

- **DAT-001**: `media` table — Drizzle migrations under `./migrations`.

## 9. Examples & Edge Cases

- File path `"/movies/Inception {tmdb-27205}/file.mkv"` → `tmdbId = 27205`.
- TMDB returns `original_language = 'fr'` for an unknown row → upsert with both languages set to `'fr'`.
- TMDB returns `data: undefined` → defaults `'en'/'en'`, no row written.
- Plex item with `type === 'episode'` → normalised to `'show'` before lookup.

## 10. Validation Criteria

- CI's non-mutating `oxlint` command enforces the import boundary via rules (no `@/features`, `@/providers`, sibling-domain imports).
- `bun run test` covers repository upsert behaviour, language resolution branches, and path parsing.

## 11. Related Specifications / Further Reading

- ../../../docs/project_structure.spec.md
- ../../features/language_sync/language_sync.spec.md
- ../../features/transcoding/transcoding.spec.md
