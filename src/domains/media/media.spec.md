---
title: Media domain
status: condensed
author: Antoine Bouteiller
date: 2026-04-17
related: [docs/specs/architecture.spec.md, docs/specs/persistence.spec.md, docs/project_structure.spec.md]
---

## 2. Problem Statement

Three features (`transcoding`, `language_sync`, `trakt_sync`) share the same need: resolve a piece of Plex media to its
TMDB identifier and original language, and persist that metadata in the `media` table for later lookup. Without a
shared home, each feature would either duplicate the TMDB + Drizzle plumbing or cross-import from another feature —
both forbidden by `project-structure.spec.md` [PI-1]. This domain exists to host that shared logic.

- `[G-1]` Provide a single entry point for "what do we know about this media" (`getMediaLanguage`,
  `getCompleteMediaDetails`).
- `[G-2]` Provide a single entry point for `media` table queries (`getMediaByIdAndType`, `createdOrUpdatedMedia`,
  `getMediaByTypeWithPagination`, `countMediaByType`).
- `[G-3]` Keep the domain passive — no routes, no cron jobs, no Telegram commands. Features call into it; it never
  calls into them.

## 3. Key Design Decisions

| Decision                        | Choice                                                                                      | Rationale                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `[KD-1]` Domain location        | `src/domains/media/` (not `src/shared/`, not a feature)                                     | Business logic with >2 consumers — follows `project-structure.spec.md` [KD-5]          |
| `[KD-2]` Passive (no register)  | No `register.ts`; no attachment to HTTP/Scheduler/Telegram                                  | Per `project-structure.spec.md` [KD-5]: domains are passive; features own entry points |
| `[KD-3]` Repository location    | `src/domains/media/repositories/media.repository.ts` — co-located with the service it backs | Consolidates the prior `src/media/` + `src/shared/media.repository.ts` split           |
| `[KD-4]` TMDB is an integration | `metadata.service` composes `TmdbClient` (`src/integrations/tmdb/`) with the repository     | Integration = thin client; service = orchestration (`architecture.spec.md` [PI-6])     |
| `[KD-5]` Upsert on lookup       | `getMediaLanguage` falls back to TMDB and upserts the `media` row                           | The "read through + write behind" pattern keeps callers ignorant of the cache miss     |

## 4. Principles & Intents

- `[PI-1]` **Independent from sibling domains.** No imports from `#domains/<other>` or `#features/*` or `#providers/*`
  — per `project-structure.spec.md` [PI-8].
- `[PI-2]` **Errors are typed and returned, not thrown.** `FileNotFoundError` and `TmdbIdNotFoundError` are exported
  from `errors.ts`; callers use `isError()`.
- `[PI-3]` **Services call repositories; callers call services.** External callers of this domain should target
  `#domains/media/services/*`, not `#domains/media/repositories/*`, unless they genuinely need raw Drizzle queries
  (e.g., the language-sync cron does a bulk paginated scan via the repository directly — that's the exception).

## 5. Non-Goals

- `[NG-1]` No cache beyond the `media` table itself — repeated TMDB lookups on unknown ids go to TMDB every time
  until the row is persisted.
- `[NG-2]` No update-on-read for existing rows — once persisted, `getMediaLanguage` returns the stored row verbatim;
  refreshing stale TMDB data is out of scope.
- `[NG-3]` No sibling-domain composition — if another domain needs media info, it must consume through the shared
  `#shared` layer, not cross-import this domain.

## 6. Caveats

- `[C-1]` `getMediaLanguage` silently upserts — callers that only want a read should be aware that a miss triggers
  a TMDB call and a DB write.
- `[C-2]` The `language_sync` feature imports the repository directly (not through the service) for its paginated
  cron sweep. This is the only consumer of the repository that isn't funneled through `metadata.service`. Noted
  under `project-structure.spec.md` [PI-3] as an intentional exception.

## 7. High-Level Components

| Component        | Module type                                                   | Responsibility                                 | Public API surface                                                                                 |
| ---------------- | ------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Metadata service | Module (`src/domains/media/services/metadata.service.ts`)     | TMDB lookup + read-through/write-behind upsert | `getMediaLanguage`, `getCompleteMediaDetails`, `extractTmdbIdFromPath`, `buildMediaTitle`          |
| Media repository | Module (`src/domains/media/repositories/media.repository.ts`) | Typed Drizzle queries on the `media` table     | `getMediaByIdAndType`, `createdOrUpdatedMedia`, `getMediaByTypeWithPagination`, `countMediaByType` |
| Errors           | Module (`src/domains/media/errors.ts`)                        | Domain error subclasses                        | `FileNotFoundError`, `TmdbIdNotFoundError`                                                         |

## 8. Detailed Design

> Condensed after implementation. See source code for full detail.

| Component        | Module                            | Entry point                                                                                                                |
| ---------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Metadata service | `src/domains/media/services/`     | `metadata.service.ts` (`getMediaLanguage`, `getCompleteMediaDetails`, `extractTmdbIdFromPath`, `buildMediaTitle`)          |
| Media repository | `src/domains/media/repositories/` | `media.repository.ts` (`getMediaByIdAndType`, `createdOrUpdatedMedia`, `getMediaByTypeWithPagination`, `countMediaByType`) |
| Errors           | `src/domains/media/`              | `errors.ts` (`FileNotFoundError`, `TmdbIdNotFoundError`)                                                                   |

## 9. Verification Criteria

- `[VC-1]` `getMediaLanguage` returns the stored row on hit; on miss calls TMDB, persists via `createdOrUpdatedMedia`,
  and returns the new row — **PASS** (`tests/domains/media/services/metadata.service.spec.ts`).
- `[VC-2]` Repository queries behave correctly: `getMediaByIdAndType` returns `undefined` on miss; `createdOrUpdatedMedia`
  upserts on `(tmdbId, type)` conflict; `getMediaByTypeWithPagination` orders by `title`; `countMediaByType` counts
  per type — **PASS** (`tests/domains/media/repositories/media.repository.spec.ts`).
- `[VC-3]` `extractTmdbIdFromPath` parses `{tmdb-<id>}` from a Plex file path — **PASS** (`tests/domains/media/services/metadata.service.spec.ts`).
- `[VC-4]` Domain imports satisfy `project-structure.spec.md` [VC-8]: no `#features/*`, no `#providers/*`, no
  `#domains/<other>/*` — verified by the cross-cutting spec's grep check.

## 10. Open Questions

N/A
