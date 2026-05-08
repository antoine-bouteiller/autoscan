---
title: Language Sync Feature
version: 1.0
date_created: 2026-05-08
last_updated: 2026-05-08
tags: [feature, plex, tmdb, telegram, scheduler]
---

# Introduction

The `language_sync` feature keeps each Plex item playing back in the user's preferred audio language. A
scheduled job walks every Plex section, resolves the preferred language for each item via `#/domains/media`,
and instructs Plex to switch the audio (and, for French, subtitle) stream selection. A Telegram conversation
lets the user override the per-media preferred language interactively.

## 1. Purpose & Scope

In scope: scheduled enforcement of the per-media preferred audio/subtitle stream on Plex, and the
`/setlanguage` Telegram conversation that updates the `media.preferred_language` column. Out of scope:
populating media rows (handled by `#/domains/media`), language detection, and Plex library refresh.

## 2. Definitions

- **Preferred language**: ISO 639-1 code stored in `media.preferred_language`; defaults to the TMDB
  `original_language` on first ingest.
- **Stream selection**: Plex `library/parts/{partsId}` PUT call setting `audioStreamID` or `subtitleStreamID`.
- **Conversation state**: per-chat finite state machine maintained by `#/providers/telegram`.

## 3. Requirements, Constraints & Guidelines

- **REQ-001** Register a cron job named `Language Sync` with pattern `0 0 */12 * * *` (every 12 hours on the
  hour) that runs `updatePlexSelectedLanguages`.
- **REQ-002** For every Plex section returned by `getSections`, the job MUST iterate every media item and
  resolve `{ mediaTitle, partsId, preferredLanguage, streams }` via `getCompleteMediaDetails(ratingKey)`.
- **REQ-003** The job MUST select the audio stream where `streamType === 2` and the normalized stream
  language code equals `preferredLanguage`.
- **REQ-004** The job MUST be idempotent: if the matching audio stream already has `selected === true` no
  Plex call is made.
- **REQ-005** When `preferredLanguage === 'fr'` and an audio change is issued, the job MUST also clear the
  subtitle track by calling `updateStream(partsId, 0, 'subtitle')`.
- **REQ-006** Register a Telegram conversation under the command `/setlanguage` driving a three-step flow
  (`awaiting_media_type` → `awaiting_media_selection` → `awaiting_language`).
- **REQ-007** `/setlanguage` MUST persist the chosen ISO 639-1 code to `media.preferred_language` keyed by
  `(tmdbId, type)`.
- **CON-001** Stream language codes returned by Plex are ISO 639-2; comparison goes through `normalizeToIso1`
  (see `#/shared/utils/iso_codes`) using the mappings in `#/shared/types/iso_codes`.
- **CON-002** Errors returned by `getCompleteMediaDetails` (`FileNotFoundError`, `TmdbIdNotFoundError`, Plex
  HTTP errors) MUST NOT abort the loop; log via `logError` and continue with the next media.
- **CON-003** When no matching audio stream exists the job logs a warning and skips the item. It MUST NOT
  fall back to another language.
- **GUD-001** All Plex/TMDB clients are resolved through the DI container (`TOKENS.PLEX_CLIENT`,
  `TOKENS.TMDB_CLIENT`); never instantiate clients directly.
- **GUD-002** Read and write media rows exclusively through `#/domains/media` repositories and services.
- **PAT-001** Job follows the cron-handler pattern described in
  `../../providers/scheduler/scheduler.spec.md`; conversation follows the callback-driven state-machine
  pattern in `../../providers/telegram/telegram.spec.md`.

## 4. Interfaces & Data Contracts

**Cron job**

| Name            | Pattern          | Handler                       |
| --------------- | ---------------- | ----------------------------- |
| `Language Sync` | `0 0 */12 * * *` | `updatePlexSelectedLanguages` |

**Telegram conversation** — registered as `/setlanguage`:

```
idle
  └── /setlanguage           → awaiting_media_type     [keyboard: Movie | TV Show]
awaiting_media_type
  └── callback `movie|show`  → awaiting_media_selection [paginated media keyboard]
awaiting_media_selection
  ├── callback `page:N`      → awaiting_media_selection (page = N)
  └── callback `select_media:{tmdbId}` → awaiting_language [ISO1 keyboard, 6 cols]
awaiting_language
  └── callback `lang:{code}` → idle (UPDATE media.preferred_language)
```

Page size is 10; the media list is fetched once per step via `getMediaByTypeWithPagination(type, 0, 100)`.
The language keyboard renders every key of `iso1ToIso2T` in 6-column rows.

**Service API** (`services/language.service.ts`):

| Function                 | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `handleUpdateLanguage`   | Idempotent stream selection; called by the job per media.      |
| `buildMediaTypeKeyboard` | Inline keyboard for step 1.                                    |
| `buildMediaKeyboard`     | Paginated keyboard for step 2.                                 |
| `buildLanguageKeyboard`  | ISO 639-1 keyboard for step 3.                                 |
| `selectMediaType`        | Transition `awaiting_media_type` → `awaiting_media_selection`. |
| `navigateMediaPage`      | Re-render media keyboard at requested page.                    |
| `selectMedia`            | Transition `awaiting_media_selection` → `awaiting_language`.   |
| `selectLanguage`         | Persist new `preferredLanguage` and transition to `idle`.      |

**Internal contract**

```ts
interface UpdateLanguageParams {
  mediaTitle: string
  partsId: number
  preferredLanguage: ISOCode1
  streams: PlexMediaStream[]
}
```

## 5. Acceptance Criteria

- **AC-001** Given a Plex media whose preferred language has a matching unselected audio stream, when the
  job runs, then `plexClient.updateStream(partsId, audioStream.id, 'audio')` is called exactly once.
- **AC-002** Given a Plex media whose matching audio stream is already `selected`, when the job runs, then
  no Plex mutation calls are made for that media.
- **AC-003** Given `preferredLanguage === 'fr'` and an audio switch is performed, then `updateStream` is
  also called with `(partsId, 0, 'subtitle')`.
- **AC-004** Given the user completes `/setlanguage` selecting `(tmdbId, type, lang)`, then
  `media.preferred_language` for that row equals `normalizeToIso1(lang)` and the conversation returns to
  `idle`.
- **AC-005** Given a media item without a TMDB id in its file path, when the job processes it, then the
  loop logs the error and continues with the next item.

## 6. Test Automation Strategy

- **Unit (Vitest)** — mock `PLEX_CLIENT`, `TMDB_CLIENT`, and `db`. Cover: idempotent path (no update),
  audio-only update, French audio + subtitle clear, missing-stream warning, error short-circuit per item.
- **Conversation tests** — drive `setLanguageConversation.onCommand` and `.onCallback` with fake state and
  callback payloads; assert produced state transitions, edited message text, and that `selectLanguage`
  issues the expected `db.update`.
- **Run** via `vp test`; lint/typecheck via `vp check` per the project review checklist.

## 7. Rationale & Context

Plex stream selection is a per-part mutation, so the job iterates `Media[0].Part[0]` via the metadata
service rather than Plex's section endpoints. Reusing `getCompleteMediaDetails` keeps TMDB lookups, the
`media` row upsert, and stream extraction in one place owned by `#/domains/media`. The 12-hour cadence
balances catching newly-imported items quickly against avoiding unnecessary Plex churn. Subtitles are only
cleared for French because that is the operator's only consistently-subtitled audio path.

## 8. Dependencies & External Integrations

### External Systems

- **EXT-001** Plex Media Server — `getSections`, `getSectionMedia`, `getPlexMetadata`, `updateStream`.
  Authenticated via `X-Plex-Token`.
- **EXT-002** TMDB — `movie/{id}` and `tv/{id}` consumed indirectly through `getMediaLanguage` for
  `original_language` resolution on first ingest.

### Internal Dependencies

- **DEP-001** `#/domains/media` — the feature reads and writes media rows through this domain
  (`getCompleteMediaDetails`, `getMediaByTypeWithPagination`, and the `media` schema). The feature does not
  query Plex/TMDB metadata directly.
- **DEP-002** `#/providers/scheduler` — registers and executes the `Language Sync` cron job.
- **DEP-003** `#/providers/telegram` — hosts the `/setlanguage` conversation, conversation state, and inline
  keyboard rendering.
- **DEP-004** `#/shared/types/iso_codes` and `#/shared/utils/iso_codes` — ISO 639-1 ↔ 639-2 mappings used to
  normalize Plex stream `languageCode` values for comparison with `preferredLanguage`.
- **DEP-005** `#/core/container` — DI tokens `PLEX_CLIENT` and `TMDB_CLIENT`.

## 9. Examples & Edge Cases

- **Already-correct selection** — French file with `selected` French audio: no Plex call, no log.
- **Audio switch** — English file with French preferred and an unselected `fra` audio stream: one
  `updateStream(audio)` call; subtitle also cleared because `preferredLanguage === 'fr'`.
- **No matching stream** — Spanish preferred but media only ships English/French: warn and continue.
- **Pagination boundary** — Library with 25 movies: keyboard shows pages 0..2, navigation buttons appear
  only when `(page+1)*10 < total`.
- **Conversation aborted mid-flow** — Unrecognized callback data leaves state unchanged; no DB write.
- **Plex returns ISO 639-2/B** — `bur`, `chi`, `fre`, … are mapped to ISO 639-1 via `iso2ToIso1` before
  comparison.

## 10. Validation Criteria

- `vp check` passes (oxlint, oxfmt, tsc).
- `vp test` covers AC-001..AC-005 with mocked Plex/TMDB clients.
- Manual: trigger `/setlanguage`, set a media to `fr`, then run the job and confirm via Plex UI that the
  audio track switched and subtitles are off.

## 11. Related Specifications / Further Reading

- ../../../docs/architecture/feature_registration.spec.md
- ../../domains/media/media.spec.md
- ../../providers/scheduler/scheduler.spec.md
- ../../providers/telegram/telegram.spec.md
