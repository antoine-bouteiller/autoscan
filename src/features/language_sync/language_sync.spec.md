---
title: Plex language sync
status: amended
author: Antoine Bouteiller
date: 2026-04-17
related: [docs/specs/architecture.spec.md, docs/specs/persistence.spec.md, src/domains/media/media.spec.md, src/providers/telegram/telegram.spec.md]
---

## 2. Problem Statement

Plex does not automatically select the "right" audio track or subtitles for multi-language content. Autoscan owns a
per-media `preferredLanguage`, defaults it to the title's original language from TMDB, lets the operator override it
via Telegram, and pushes the selection to Plex on a schedule.

- `[G-1]` Every Plex media item should default to original-language audio (via TMDB lookup).
- `[G-2]` Operator can override per-media via `/setlanguage` in Telegram.
- `[G-3]` A cron every 12h reconciles Plex audio track selection with the stored preference.
- `[G-4]` When preferred language is French, explicitly disable subtitles on Plex; otherwise leave subs alone.

## 3. Key Design Decisions

| Decision                        | Choice                                                                                           | Rationale                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `[KD-1]` Language storage       | `media` table keyed by `(tmdb_id, type)` with `original_language` + `preferred_language` columns | Deduplicated across movie/show; preference persists across Plex rescans   |
| `[KD-2]` Default preference     | On first sighting, `preferred_language = original_language` from TMDB                            | Sensible default; no operator action required                             |
| `[KD-3]` Reconciliation cadence | Cron every 12h at minute 0 (`0 0 */12 * * *`)                                                    | Matches transcode cadence; not latency-sensitive                          |
| `[KD-4]` Override channel       | Telegram `/setlanguage` multi-step conversation                                                  | Operator-only surface matches single-user bot design                      |
| `[KD-5]` Source of truth        | The DB `preferred_language` is authoritative; Plex is the "view"                                 | Rebuilding Plex doesn't lose operator choices                             |
| `[KD-6]` Subtitle handling      | If preferred is `fr`, set subtitle stream to `0` (none); otherwise do not touch subtitles        | French content + French audio rarely needs subs; other languages often do |

## 4. Principles & Intents

- `[PI-1]` **No mutation without necessity** — if the desired audio stream is already `selected`, skip the Plex call.
- `[PI-2]` **Preference language → ISO 639-1 normalized** — all DB storage and comparison happens in ISO-1 via
  `normalizeToIso1()` (which handles 639-2/B/T variants).
- `[PI-3]` **Failures per media are logged, not fatal** — job loops over all Plex items; one missing stream doesn't
  abort the run.
- `[PI-4]` **Pagination in the Telegram UI** — media list is navigable (`◀️` / `▶️`) with `PAGE_SIZE = 10`.

## 5. Non-Goals

- `[NG-1]` No automatic subtitle download — see `subtitle_scan.command.ts` for a reporting-only scan.
- `[NG-2]` No audio re-encoding from the sync job — re-encoding is the transcoder's responsibility.
- `[NG-3]` No multi-user preferences — one operator, one preference per media.
- `[NG-4]` Forced-subtitle language selection is not driven by this module (that's in the transcoder).

## 6. Caveats

- `[C-1]` If Plex has no audio stream in the preferred language, we log a warning and do nothing — we do not fall
  back to original language.
- `[C-2]` TMDB failures fall back to `{ originalLanguage: 'en', preferredLanguage: 'en' }` and do not persist — next
  sighting retries.
- `[C-3]` `selectMediaType` and navigation re-fetch the first 100 media per call; large libraries paginate only in
  the UI, not in the DB query.
- `[C-4]` `handleUpdateLanguage` uses `streamType === 2` to identify audio streams (Plex convention); changes to
  Plex's schema would silently break selection.

## 7. High-Level Components

| Component             | Module type                                                               | Responsibility                                                         | Public API surface                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Language service      | Module (`src/features/language_sync/services/language.service.ts`)        | Preference storage + Plex stream reconciliation + Telegram UI builders | `handleUpdateLanguage`, `buildMediaTypeKeyboard`, `buildMediaKeyboard`, `buildLanguageKeyboard`, `selectMediaType`, `navigateMediaPage`, `selectMedia`, `selectLanguage` |
| Language job          | Module (`src/features/language_sync/jobs/language.job.ts`)                | Cron entry                                                             | `updatePlexSelectedLanguages`                                                                                                                                            |
| Telegram conversation | Module (`src/features/language_sync/commands/language.command.ts`)        | Multi-step `/setlanguage`                                              | `setLanguageConversation`                                                                                                                                                |
| Feature register      | Module (`src/features/language_sync/register.ts`)                         | Wires cron + telegram conversation                                     | `registerLanguageSync()`                                                                                                                                                 |
| Metadata service      | Domain (`src/domains/media/services/metadata.service.ts`)                 | TMDB lookup + media-row upsert (used by multiple features)             | `getMediaLanguage(tmdbId, mediaType)`, `getCompleteMediaDetails(ratingKey)`, `extractTmdbIdFromPath`, `buildMediaTitle`                                                  |
| Media repository      | Domain (`src/domains/media/repositories/media.repository.ts`)             | Drizzle queries                                                        | `getMediaByIdAndType`, `createdOrUpdatedMedia`, `getMediaByTypeWithPagination`, `countMediaByType`                                                                       |
| ISO code utils        | Shared (`src/shared/utils/iso_codes.ts`, `src/shared/types/iso_codes.ts`) | Normalize between 639-1/2/B/T                                          | `normalizeToIso1`, `iso1ToIso2B`, `iso1ToIso2T` (map), `ISOCode1`, `ISO1`                                                                                                |

## 8. Detailed Design

> Condensed after implementation. See source code for full detail.

| Component             | Module                                   | Entry point                                                                                                                                               |
| --------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language service      | `src/features/language_sync/services/`   | `src/features/language_sync/services/language.service.ts`                                                                                                 |
| Language job          | `src/features/language_sync/jobs/`       | `src/features/language_sync/jobs/language.job.ts` (`updatePlexSelectedLanguages`)                                                                         |
| Telegram conversation | `src/features/language_sync/commands/`   | `src/features/language_sync/commands/language.command.ts` (`setLanguageConversation`)                                                                     |
| Feature register      | `src/features/language_sync/`            | `src/features/language_sync/register.ts` (`registerLanguageSync`)                                                                                         |
| Feature types         | `src/features/language_sync/`            | `src/features/language_sync/types.ts` (`UpdateLanguageParams`)                                                                                            |
| Metadata service      | `src/domains/media/services/`            | `src/domains/media/services/metadata.service.ts` (`getMediaLanguage`, `getCompleteMediaDetails`, `extractTmdbIdFromPath`, `buildMediaTitle`)              |
| Media repository      | `src/domains/media/repositories/`        | `src/domains/media/repositories/media.repository.ts` (`getMediaByIdAndType`, `createdOrUpdatedMedia`, `getMediaByTypeWithPagination`, `countMediaByType`) |
| ISO code utils        | `src/shared/utils/`, `src/shared/types/` | `src/shared/utils/iso_codes.ts` (`normalizeToIso1`), `src/shared/types/iso_codes.ts` (`ISOCode1`, `ISO1`, `iso1ToIso2B`, `iso1ToIso2T`)                   |

## 9. Verification Criteria

- `[VC-1]` `getMediaLanguage` returns cached row when present, upserts TMDB result otherwise — **PASS**
  (`tests/services/metadata.service.spec.ts`).
- `[VC-2]` `handleUpdateLanguage` no-ops when already selected; calls `updateStream('audio')` otherwise; calls
  `updateStream(0, 'subtitle')` additionally when pref is `fr` — **PASS** (`tests/services/language.service.spec.ts`).
- `[VC-3]` Cron iterates all sections and all media without aborting on single-item errors — **PASS**
  (`tests/services/language.service.spec.ts`, indirectly + manual run).
- `[VC-4]` `/setlanguage` full flow: media-type → paginated media → language → DB update — **PASS**
  (`tests/services/language.service.spec.ts`).
- `[VC-5]` `buildMediaKeyboard` produces `Previous`/`Next` only when applicable — **PASS**
  (`tests/services/language.service.spec.ts`).
- `[VC-6]` `normalizeToIso1` accepts ISO-1, ISO-2/B, and ISO-2/T inputs — **PASS** (`tests/utils/iso_codes.spec.ts`).
- `[VC-7.1]` `registerLanguageSync()` attaches exactly: cron `Language Sync` (12h) and `/setlanguage` conversation.

## 10. Open Questions

N/A

## Changelog

| Date       | Amendment                            | Sections affected | Reason                                                                                                                                                                                     |
| ---------- | ------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-17 | Retarget media imports to `#domains` | §7, §8            | `#media/metadata.service` → `#domains/media/services/metadata.service`; `#shared/media.repository` → `#domains/media/repositories/media.repository` per `project-structure.spec.md` [KD-5] |
