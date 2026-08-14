---
title: Language Sync
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

Plex playback needs to use each media record's preferred audio language without requiring the operator to change streams item by item. The feature periodically aligns Plex stream selection and provides a Telegram conversation for setting the preference.

- `[G-1]` Select the preferred audio stream for each Plex media part without unnecessary mutations.
- `[G-2]` Let the operator set a media preference by movie or show and persist it by TMDB identity.

## 3. Key Design Decisions

| Decision                        | Choice                                                                                                | Rationale                                                                                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[KD-1]` Scheduling             | Register `Language Sync` on `0 */12 * * *`.                                                           | A periodic pass applies preferences to imports while limiting Plex mutations; the registered feature contract establishes this cadence (`src/features/language_sync/feature.ts:10`). |
| `[KD-2]` Stream identity        | Compare normalized Plex audio language codes to `preferredLanguage`.                                  | Plex supplies stream codes in a different representation, so normalization prevents equivalent language codes from failing to match.                                                 |
| `[KD-3]` French subtitles       | Clear the selected subtitle only after changing audio to French.                                      | This preserves the operator's French playback convention while avoiding a subtitle mutation when audio already matches.                                                              |
| `[KD-4]` Preference interaction | Use a callback-driven three-state Telegram conversation and update the media row by `(tmdbId, type)`. | The selection requires dependent choices while TMDB identity and media type uniquely identify the persisted preference.                                                              |

## 4. Principles & Intents

- `[PI-1]` Domain ownership — resolve media details and lists through the media domain rather than duplicating its metadata or repository access.
- `[PI-2]` Idempotent alignment — a selected matching audio stream produces no Plex update.
- `[PI-3]` Per-item resilience — a media-detail failure is logged and does not stop the section traversal (`src/features/language_sync/jobs/language.job.ts:20`).

## 5. Non-Goals

- `[NG-1]` Populate media rows, detect languages, or refresh Plex libraries.
- `[NG-2]` Choose a fallback stream when the preferred language is absent.

## 6. Caveats

- `[C-1]` A media item without a matching audio stream is warned and skipped.
- `[C-2]` The conversation loads at most 100 media records per selected type and displays ten per page.
- `[C-3]` Invalid callback data leaves the current conversation state unchanged.

## 7. High-Level Components

| Component                 | Module type           | Responsibility                                            | Public API surface                        |
| ------------------------- | --------------------- | --------------------------------------------------------- | ----------------------------------------- |
| Language job              | Effect job            | Traverse Plex sections and align each media part          | `updatePlexSelectedLanguages`             |
| Language service          | Effect service        | Select streams and construct/persist conversation choices | `handleUpdateLanguage`, selection helpers |
| Set-language conversation | Telegram conversation | Route command and callback state transitions              | `/setlanguage`                            |

## 8. Detailed Design

### Language job

The job reads Plex sections, obtains their media, resolves complete media details through the media domain, and invokes stream alignment for each item. It continues after non-interruption failures and registers under the twelve-hour cron contract (`src/features/language_sync/feature.ts:10`).

### Language service

For each part, the service finds an audio stream with `streamType === 2` whose normalized code equals `preferredLanguage`. If that stream is not selected, it updates audio; for `fr`, it then sets subtitle stream `0` (`src/features/language_sync/services/language.service.ts:55`, `src/features/language_sync/services/language.service.ts:68`). Absence of a match logs a warning and makes no selection.

The conversation transitions as follows:

```text
/setlanguage → awaiting_media_type → awaiting_media_selection → awaiting_language → idle
```

It offers movie/show, a paginated media keyboard, then ISO-639-1 codes in six-column rows. The language choice normalizes the code, updates `media.preferredLanguage` for the selected TMDB id and type, edits the prompt, and returns `idle` (`src/features/language_sync/services/language.service.ts:116`).

### Set-language conversation

The command sends the media-type keyboard. Each callback is acknowledged and dispatched only when its payload matches the active state; otherwise the state is retained (`src/features/language_sync/commands/language.command.ts:38`).

## 9. Open Questions

N/A
