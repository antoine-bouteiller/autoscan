---
title: Media Domain
status: implemented
author: Antoine Bouteiller
date: 2026-08-14
related:
  [
    docs/project_structure.spec.md,
    docs/architecture/architecture.spec.md,
    src/features/language_sync/language_sync.spec.md,
    src/features/transcoding/transcoding.spec.md,
  ]
---

## 2. Problem Statement

Features that process Plex media need a shared identity, language preference, and metadata-resolution boundary rather than independently parsing file paths or querying external systems. The media domain stores the language record keyed by TMDB identity and assembles the Plex-derived details consumers use for language and transcoding workflows.

- `[G-1]` Persist one media language record for each `(tmdbId, media type)` identity.
- `[G-2]` Resolve original and preferred language with a cache-first TMDB lookup.
- `[G-3]` Translate Plex metadata into a complete, typed media detail result or a domain error.

## 3. Key Design Decisions

| Decision                  | Choice                                                                                                         | Rationale                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `[KD-1]` Media identity   | Use `(tmdbId, type)` as the composite primary key.                                                             | TMDB numeric IDs require media type as a discriminator, permitting the same number in movie and show namespaces.             |
| `[KD-2]` Language storage | Store original and preferred ISO 639-1 codes and initialize preference from original language on every upsert. | Consumers compare a compact common language representation, and metadata refreshes preserve one coherent default preference. |
| `[KD-3]` Metadata lookup  | Read the repository first and persist only TMDB results with data.                                             | Cached records avoid external calls; absent metadata yields a deterministic fallback without creating a speculative row.     |
| `[KD-4]` Plex correlation | Extract the TMDB ID from a `{tmdb-<id>}` token in the primary Plex part path.                                  | Plex rating keys are vendor-local, while the path token supplies the cross-system identity used by persistence and TMDB.     |
| `[KD-5]` Domain errors    | Return tagged errors for missing primary files and missing or invalid TMDB tokens.                             | Callers can distinguish incomplete Plex metadata from external-client failures and decide whether to continue work.          |

## 4. Principles & Intents

- `[PI-1]` Shared identity boundary — consumers use TMDB ID and normalized media type rather than vendor-specific Plex identifiers.
- `[PI-2]` Typed Effect I/O — database, Plex, and TMDB dependencies remain in Effect requirements and failures remain observable in the error channel.
- `[PI-3]` Deterministic fallback — unresolved TMDB metadata produces English language values without persistence side effects.

## 5. Non-Goals

- `[NG-1]` The domain does not choose Plex audio or subtitle streams.
- `[NG-2]` The domain does not let callers update preferred language independently of media upsert behavior.
- `[NG-3]` The domain does not search Plex libraries, refresh Plex sections, or own feature scheduling.

## 6. Caveats

- `[C-1]` The schema restricts media types to `movie` and `show` and marks both language columns non-null (`src/database/schema.ts:5-15`).
- `[C-2]` Upsert conflict handling resets `preferredLanguage` to the supplied original language as well as updating title and original language (`src/domains/media/repositories/media.repository.ts:27-30`).
- `[C-3]` Metadata resolution reads only `Media[0].Part[0]`; an item whose usable file is elsewhere returns `FileNotFoundError` (`src/domains/media/services/metadata.service.ts:43-48`).
- `[C-4]` The path parser accepts a numeric conversion of the token; `getCompleteMediaDetails` rejects `NaN` ahead of lookup (`src/domains/media/services/metadata.service.ts:8-10`, `src/domains/media/services/metadata.service.ts:50-53`).
- `[C-5]` TMDB client failures are treated as absent metadata for language resolution, while Plex metadata failures remain in the Effect error channel (`src/domains/media/services/metadata.service.ts:23-30`, `src/domains/media/services/metadata.service.ts:39-42`).

## 7. High-Level Components

| Component        | Module type        | Responsibility                                                 | Public API surface                                                                                 |
| ---------------- | ------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Media schema     | Drizzle schema     | Define persisted identity and language fields                  | `mediaTypeEnum`, `media`, `Media`                                                                  |
| Media repository | Effect repository  | Query, count, upsert, and page media rows                      | `countMediaByType`, `createdOrUpdatedMedia`, `getMediaByIdAndType`, `getMediaByTypeWithPagination` |
| Metadata service | Effect service     | Parse identifiers, resolve language, and assemble Plex details | `extractTmdbIdFromPath`, `buildMediaTitle`, `getMediaLanguage`, `getCompleteMediaDetails`          |
| Media errors     | Tagged error types | Describe missing files and missing TMDB identifiers            | `FileNotFoundError`, `TmdbIdNotFoundError`                                                         |

## 8. Detailed Design

### Media schema

The `media` table holds non-null title, TMDB ID, type, original language, and preferred language. Its language fields use the `ISO1` enum, and the named primary key spans `tmdbId` and `type` (`src/database/schema.ts:7-21`). The inferred `Media` type supplies the selected-row shape (`src/database/schema.ts:36`).

### Media repository

Repository operations acquire the `Database` Effect service and wrap rejected Drizzle promises as `DatabaseQueryError` (`src/domains/media/repositories/media.repository.ts:4-13`). `countMediaByType` returns a count query for one type. `createdOrUpdatedMedia` inserts the supplied TMDB ID, type, title, and original language, sets the initial preference, and resolves a composite-key conflict by updating those values (`src/domains/media/repositories/media.repository.ts:15-32`).

`getMediaByIdAndType` returns the first matching row or `undefined`. `getMediaByTypeWithPagination` filters by type, orders title ascending, then applies offset `pageSize * page` and limit `pageSize` (`src/domains/media/repositories/media.repository.ts:34-55`).

### Metadata service

`extractTmdbIdFromPath` reads the `{tmdb-<id>}` token, and `buildMediaTitle` joins the defined grandparent, parent, and item titles with `-` (`src/domains/media/services/metadata.service.ts:8-14`). `getMediaLanguage` first returns a cached row's original and preferred values. On a cache miss it obtains the TMDB service, treats client failure or absent data as `{ originalLanguage: 'en', preferredLanguage: 'en' }`, and otherwise persists TMDB's title and original language, then returns both values (`src/domains/media/services/metadata.service.ts:16-37`).

`getCompleteMediaDetails` obtains Plex metadata by rating key, constructs its display title, and requires a file in the primary media part. It extracts and validates the TMDB ID, normalizes Plex `episode` to `show`, resolves language, and returns file, title, type, languages, part ID, streams, and TMDB ID (`src/domains/media/services/metadata.service.ts:39-67`).

### Media errors

`FileNotFoundError` carries the media title for absent primary files. `TmdbIdNotFoundError` carries both title and path when correlation fails; both are `Data.TaggedError` values with readable messages (`src/domains/media/errors.ts:3-23`).

## 9. Open Questions

N/A
