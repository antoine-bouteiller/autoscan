---
title: Subtitle Scan
status: amended
author: Antoine Bouteiller
date: 2026-09-08
related:
  - docs/project_structure.spec.md
  - docs/architecture/architecture.spec.md
  - src/providers/scheduler/scheduler.spec.md
  - src/providers/telegram/telegram.spec.md
  - src/domains/media/media.spec.md
  - src/features/transcoding/transcoding.spec.md
---

## 2. Problem Statement

Subtitle files reach the library from Bazarr downloads and from transcoding extraction, and some of them are wrong: a
full-dialogue slot filled by a forced track, or a track whose timing drifts from the media. Other media stay without
subtitles for days because no provider has them, and French-audio media keep requesting full subtitles they never need.
The feature is a scheduled, incremental scan that fixes what it can through Bazarr, alerts the operator on what it
cannot, and keeps Bazarr's per-media language requests aligned with the audio actually played.

- `[G-1]` Analyze every sidecar subtitle file once per content hash and scan version; never re-analyze a file that already passed at the current scan version.
- `[G-2]` Remove unwanted forced subtitles and re-synchronize out-of-sync subtitles through Bazarr.
- `[G-3]` For media missing subtitles for more than 3 days, alert on Telegram when none exist and translate through Bazarr when one exists.
- `[G-4]` Assign the Bazarr French preset to French-audio media and release the request after 7 days without a forced subtitle.

## 3. Key Design Decisions

| Decision                        | Choice                                                                                                                                                                        | Rationale                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[KD-1]` Entry points           | Register `Subtitle Scan` on `0 5 * * *` and the `/subtitlescan` Telegram command as the manual trigger for the same pass.                                                     | Subtitle changes arrive through Bazarr on its own schedule; a daily pass is enough to honor 3-day and 7-day windows while keeping the library traversal off the 12-hour jobs. One command name means one owner, so this feature is the sole registrant of `/subtitlescan`.                                                             |
| `[KD-2.1]` Scan identity        | Key the scan registry by `(SHA-256 of subtitle content, SUBTITLE_SCAN_VERSION)`, not by path.                                                                                 | A content hash detects Bazarr rewrites without invalidating renames; the scan version makes unchanged files eligible when analysis behavior changes.                                                                                                                                                                                   |
| `[KD-3.1]` Registry scope       | Record every analyzed `(hash, scanVersion)` with its verdict (`passed`, `forced_removed`, `sync_requested`), and skip any pair already present.                               | Only passing files must be skipped (`[G-1]`), but recording actioned hashes too prevents re-requesting the same Bazarr sync every day when Bazarr leaves the file untouched; an actual rewrite yields a new hash and is analyzed again.                                                                                                |
| `[KD-4]` Unwanted forced        | A `.<lang>.srt` file (no `.forced.` marker) whose content satisfies the forced heuristic is unwanted and is deleted through Bazarr.                                           | A forced track in the full-subtitle slot hides the real gap from Bazarr; deleting through Bazarr rather than the filesystem updates its history so the language returns to the wanted list and is searched again. Files named `.forced.srt` are wanted by construction. Replacement search is left to Bazarr's wanted-search schedule. |
| `[KD-5]` Out-of-sync detection  | Compare start timestamps pairwise between sibling `.srt` files of one media; a pair is divergent when more than 50% of aligned cues differ by over 300 ms.                    | No audio-aligned reference is available without running ffsubsync locally; sibling agreement is cheap and already the operator's accepted signal (`src/features/transcoding/commands/subtitle_scan.command.ts:56`).                                                                                                                    |
| `[KD-6.1]` Sync target          | In a divergent pair, request Bazarr sync only for files not yet registered as `passed` at the current scan version; when neither is registered, sync both.                    | A file that already passed against an earlier sibling is the more trustworthy side; syncing only the newcomer avoids disturbing a known-good file. Bazarr's sync aligns against audio, so syncing both when nothing is known converges regardless of which drifted.                                                                    |
| `[KD-7]` Missing-subtitle clock | Persist the first time each `(bazarr item, language)` appears in Bazarr's wanted list and act once when that row is older than 3 days.                                        | Bazarr's wanted list is the authoritative "missing" signal for the configured profile but carries no age; a first-seen row gives a deterministic 3-day window and an `actedAt` marker makes the alert or translation happen once.                                                                                                      |
| `[KD-8]` French-audio identity  | A media is French-audio when its media-domain `preferredLanguage` is `fr`.                                                                                                    | `preferredLanguage` is the audio Plex plays (`src/features/language_sync/language_sync.spec.md`); it defaults to the original language, so French films and French-dubbed media are both covered by one rule.                                                                                                                          |
| `[KD-9]` Profile lifecycle      | Persist `(bazarr item, assignedAt, releasedAt)`; assign the preset once, release the profile after 7 days without a `fr` forced subtitle, and never reassign a released item. | Without a terminal state the next pass would see French audio again and reassign the preset, producing a 7-day assign/release loop.                                                                                                                                                                                                    |
| `[KD-10]` Bazarr boundary       | Add a thin `src/integrations/bazarr` client exposing wanted lists, item lookup by path, subtitle sync/translate/delete, and profile listing/assignment.                       | Bazarr is a vendor; the integration owns HTTP shape and validation while the feature owns policy, matching the arr and Plex clients (`docs/project_structure.spec.md` `[PI-3]`).                                                                                                                                                       |

## 4. Principles & Intents

- `[PI-1]` Incremental by default — at the same scan version, a pass over an unchanged library performs hashes and lookups only; every mutation is triggered by a new hash, a scan-version bump, or an elapsed window.
- `[PI-2]` Bazarr owns subtitle files — deletion, sync, translation, and download are Bazarr requests; the feature never writes a subtitle file itself.
- `[PI-3]` Per-item resilience — a media, Bazarr, or filesystem failure is logged and the traversal continues, as in `src/features/language_sync/jobs/language.job.ts:20`.
- `[PI-4]` Act once — every time-window action (alert, translate, release) is recorded so a daily cadence never repeats it.

## 5. Non-Goals

- `[NG-1]` Running ffsubsync or any audio-based alignment locally.
- `[NG-2]` Choosing subtitle providers, scores, or languages beyond the profiles configured in Bazarr.
- `[NG-3]` Scanning subtitle streams embedded in the media container; only sidecar `.srt` files are analyzed.
- `[NG-4]` Reporting a per-pass summary to Telegram; only the all-missing alert is user-facing.

## 6. Caveats

- `[C-1]` Bazarr, Plex, and this service must see the same file paths; item lookup matches Bazarr's `path` against the Plex part path, like `src/integrations/arr/sonarr.service.ts:34`.
- `[C-2]` The forced heuristic requires the media duration, which comes from an ffprobe of the media file (`src/features/transcoding/services/helpers/subtitle.ts:18`). The probe runs only for media with at least one unregistered subtitle file.
- `[C-3]` A media with a single sidecar subtitle cannot be checked for sync and passes on the forced check alone.
- `[C-4]` A file rewritten by Bazarr sync that is still divergent is analyzed and synced again on the next pass; convergence relies on ffsubsync. No attempt counter is kept.
- `[C-5]` Bazarr API paths and payloads (`/api/movies/wanted`, `/api/episodes/wanted`, `/api/subtitles`, `/api/system/languages/profiles`, `/api/movies`, `/api/episodes`) follow Bazarr 1.4; the integration validators pin the fields the feature reads and must be checked against the deployed version.
- `[C-6]` The French preset is resolved by name from `BAZARR_FRENCH_PROFILE`; a missing profile fails the French policy for the whole pass and is logged, while the scan and missing-subtitle policies still run.
- `[C-7]` Releasing a profile sets the Bazarr item's language profile to none; Bazarr then stops listing it as wanted, so the `released` state lives only in this feature's table.
- `[C-8]` Missing-subtitle rows are removed when the `(item, language)` leaves Bazarr's wanted list, so a subtitle that later disappears restarts the 3-day clock.
- `[C-9]` Translation uses the first present non-forced subtitle of the item as source; Bazarr chooses the translation engine.

## 7. High-Level Components

```text
cron 0 5 * * *
  └─ scan job ── Plex sections ──► media details (media domain)
        ├─ file scan ─── hash ▸ registry miss ▸ forced? ▸ delete via Bazarr
        │                                   ▸ divergent pair? ▸ sync via Bazarr
        │                                   ▸ else record passed
        ├─ missing policy ── Bazarr wanted ▸ first-seen rows ▸ >3d ▸ alert | translate
        └─ french policy ─── preferredLanguage=fr ▸ assign preset ▸ >7d no forced ▸ release
```

| Component             | Module type                   | Responsibility                                                           | Public API surface                                                                                 |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Scan job              | Effect job + Telegram command | Traverse Plex media and run the three policies per item under one permit | `runSubtitleScan`, `/subtitlescan`                                                                 |
| Scan registry         | Drizzle schema + repository   | Persist analyzed hashes, missing first-seen rows, and profile lifecycle  | `subtitleScans`, `missingSubtitles`, `frenchProfiles`, repository functions                        |
| Analysis service      | Effect service                | Hash, classify forced and divergent files, request Bazarr actions        | `scanMediaSubtitles`                                                                               |
| Missing policy        | Effect service                | Reconcile wanted list with first-seen rows and act after 3 days          | `applyMissingPolicy`                                                                               |
| French profile policy | Effect service                | Assign the French preset and release it after 7 days without forced      | `applyFrenchProfilePolicy`                                                                         |
| Bazarr client         | Integration                   | Typed Bazarr HTTP surface                                                | `IBazarrClient`, `Bazarr` service key, `BAZARR_API_URL`, `BAZARR_API_KEY`, `BAZARR_FRENCH_PROFILE` |

## 8. Detailed Design

### Scan job

`runSubtitleScan` acquires a single scan permit (an item is skipped, not queued, when a pass is running), reads Plex sections and media, resolves `getCompleteMediaDetails` per item, and runs `scanMediaSubtitles` then `applyFrenchProfilePolicy` for each. `applyMissingPolicy` runs once per pass after traversal because it is driven by Bazarr's wanted list rather than by Plex items. Non-interruption failures per item are logged with the media title and the loop continues; the job's own failure is logged at the scheduler boundary.

`/subtitlescan` submits the same pass to `BackgroundTasks`, replies `Starting subtitle scan...` or `A subtitle scan is already running.` according to permit admission, and returns `{ step: 'idle' }`; it produces no report (`[NG-4]`).

### Scan registry

The feature owns `SUBTITLE_SCAN_VERSION = 1`, a positive integer constant shared by `/subtitlescan` and the scheduled pass. Increment it when forced detection, timing comparison, or other file-analysis behavior changes. The next pass treats all hashes without a verdict at that exact version as unregistered, including hashes with older `passed`, `forced_removed`, or `sync_requested` verdicts. Old verdicts are neither skip signals nor trusted sync references. A bump does not launch a pass itself; the schedule or command does.

Versions increase monotonically and are not reused for different behavior. Old rows may remain: all lookups and writes include the current version, so no registry purge is needed. The version is not a Telegram argument or environment setting. It does not reset `missingSubtitles` clocks/action markers or `frenchProfiles` lifecycle state, and it does not invalidate transcode results.

```ts
export const subtitleVerdictEnum = pgEnum('subtitle_verdict', ['passed', 'forced_removed', 'sync_requested'])
export const bazarrKindEnum = pgEnum('bazarr_kind', ['movie', 'episode'])

export const subtitleScans = pgTable(
  'subtitle_scans',
  {
    hash: text().notNull(), // hex SHA-256 of file content
    scanVersion: integer('scan_version').notNull(),
    filePath: text('file_path').notNull(), // last path seen; informational
    verdict: subtitleVerdictEnum().notNull(),
    scannedAt: timestamp('scanned_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.hash, t.scanVersion] })]
)

export const missingSubtitles = pgTable(
  'missing_subtitles',
  {
    bazarrKind: bazarrKindEnum('bazarr_kind').notNull(),
    bazarrId: integer('bazarr_id').notNull(), // radarrId or sonarrEpisodeId
    language: text({ enum: ISO1 }).notNull(),
    firstSeenAt: timestamp('first_seen_at').notNull(),
    actedAt: timestamp('acted_at'),
  },
  (t) => [primaryKey({ columns: [t.bazarrKind, t.bazarrId, t.language] })]
)

export const frenchProfiles = pgTable(
  'french_profiles',
  {
    bazarrKind: bazarrKindEnum('bazarr_kind').notNull(),
    bazarrId: integer('bazarr_id').notNull(),
    assignedAt: timestamp('assigned_at').notNull(),
    releasedAt: timestamp('released_at'),
  },
  (t) => [primaryKey({ columns: [t.bazarrKind, t.bazarrId] })]
)
```

Repository functions follow `src/domains/media/repositories/media.repository.ts`: each wraps Drizzle in `Database.use` and maps rejections to `DatabaseQueryError`. `subtitleScans` inserts use `onConflictDoNothing` so two files with identical content share one row per scan version. The tables live in `src/database/schema.ts` with a generated migration under `migrations/`.

Passing records survive restarts and have no time-based expiry. Scheduled and manual passes use the same registry: an unchanged passing hash is never analyzed or actioned again at that scan version, though its contents may be read as a reference for an unregistered sibling (`[KD-6.1]`). A content rewrite or scan-version bump is a new candidate; a rename alone is not. Failed or interrupted analysis never records `passed`, and a failed registry write leaves the hash eligible for a later pass.

This registry is independent of the passed-file registry in `src/features/transcoding/transcoding.spec.md`. A successfully checked media file skips further transcode analysis for that identity, not subtitle analysis or the missing/French policies. Transcoding never marks extracted sidecars as passed: they enter this scan as unregistered subtitle hashes. Conversely, a passing subtitle does not certify the media's transcode criteria.

### Analysis service

`scanMediaSubtitles(details)` lists sibling files `<base>.<lang>.srt` and `<base>.<lang>.forced.srt` in the media directory, then:

```text
version ← SUBTITLE_SCAN_VERSION
for each sidecar: hash ← sha256(content); known ← registry.get(hash, version)
candidates ← sidecars with known = undefined and no `.forced.` marker
if candidates is empty → return           # PI-1: no probe, no Bazarr call
duration ← ffprobe(details.file).duration
for each candidate:
  if isForcedSubtitle(path, duration) → bazarr.deleteSubtitle(item, lang); record(hash, version, forced_removed)
remaining ← candidates not removed
for each pair (a, b) of non-forced sidecars with at least one in remaining:
  if divergent(a, b):
    targets ← pair members not registered `passed` at version
    for t in targets: bazarr.syncSubtitle(item, lang(t)); record(hash(t), version, sync_requested)
record(hash, version, passed) for every remaining candidate not marked sync_requested
```

`isForcedSubtitle`, `parseStartTimestamps`, and the divergence rule are shared helpers with the thresholds in force today: fewer than 3 cues per minute or under 15% screen-time ratio for forced, 300 ms and 50% for divergence. The Bazarr item is resolved once per media by path (`getMovieByPath` or `getEpisodeByPath`); an unresolvable item logs a warning and records nothing, so the media is retried next pass. A file that is deleted or sync-requested is never recorded as `passed` in the same pass.

### Missing policy

```text
wanted ← bazarr.getWantedMovies() ++ bazarr.getWantedEpisodes()
rows ← repository.listMissing()
for each (item, lang) in wanted with lang not forced: upsert first_seen_at = now on absence
delete rows whose (item, lang) is not in wanted
for each row with first_seen_at < now - 3d and acted_at is null:
  item ← wanted[row]
  if item.subtitles (non-forced) is empty:
    telegram.sendMessage(TELEGRAM_CHAT_ID, "No subtitles for <title> after 3 days (missing: en, fr)")   # once per item, not per language
  else:
    bazarr.translateSubtitle(item, source = item.subtitles[0], target = row.language)
  set acted_at = now
```

The all-missing alert groups every unacted row of one item into one message and marks all of them acted. A Bazarr or Telegram failure leaves `actedAt` null so the action is retried on the next pass.

### French profile policy

```text
if details.preferredLanguage ≠ 'fr' → return
row ← repository.getFrenchProfile(item)
if row = undefined: bazarr.setProfile(item, frenchPresetId); insert assigned_at = now; return
if row.released_at ≠ null → return                                   # KD-9 terminal state
if exists sidecar `<base>.fr.forced.srt` → return                    # request satisfied; keep profile
if row.assigned_at < now - 7d: bazarr.setProfile(item, none); set released_at = now
```

The preset id is resolved once per pass from `bazarr.getProfiles()` by the name in `BAZARR_FRENCH_PROFILE`. Because the French preset requests only `fr:forced`, the missing policy's non-forced filter (`[KD-7]`) never alerts or translates for these items.

### Bazarr client

```ts
export interface IBazarrClient {
  readonly getWantedMovies: Effect.Effect<BazarrItem[], HttpClientError>
  readonly getWantedEpisodes: Effect.Effect<BazarrItem[], HttpClientError>
  readonly getMovieByPath: (filePath: string) => Effect.Effect<BazarrItem | undefined, HttpClientError>
  readonly getEpisodeByPath: (filePath: string) => Effect.Effect<BazarrItem | undefined, HttpClientError>
  readonly getProfiles: Effect.Effect<{ profileId: number; name: string }[], HttpClientError>
  readonly setProfile: (item: BazarrItemRef, profileId: number | null) => Effect.Effect<void, HttpClientError>
  readonly deleteSubtitle: (item: BazarrItemRef, subtitle: BazarrSubtitleRef) => Effect.Effect<void, HttpClientError>
  readonly syncSubtitle: (item: BazarrItemRef, subtitle: BazarrSubtitleRef) => Effect.Effect<void, HttpClientError>
  readonly translateSubtitle: (item: BazarrItemRef, source: BazarrSubtitleRef, target: ISOCode1) => Effect.Effect<void, HttpClientError>
}

interface BazarrItemRef {
  kind: 'movie' | 'episode'
  id: number
} // radarrId | sonarrEpisodeId
interface BazarrSubtitleRef {
  language: ISOCode1
  forced: boolean
  hi: boolean
  path: string
}
interface BazarrItem extends BazarrItemRef {
  title: string
  path: string
  subtitles: BazarrSubtitleRef[]
  missingSubtitles: { language: ISOCode1; forced: boolean }[]
}
```

The client is built on `httpClient` with header `X-API-KEY` and base `${BAZARR_API_URL}/api`, registered as a `Bazarr` service key in `src/core/runtime.service.ts` and constructed in the composition root beside the arr clients. Sync, translate, and delete map to `PATCH`/`DELETE /subtitles` with `action` `sync` or `translate`; profile assignment maps to `POST /movies` or `POST /episodes` with `profileid`. Responses are validated with co-located Effect Schemas that read only the fields above. `BAZARR_API_KEY` supports the `_FILE` secret convention (`src/config/env.ts:3`).

## 9. Open Questions

N/A — `[OQ-1]` (manual trigger: this feature owns `/subtitlescan`, folded into `[KD-1]`), `[OQ-2]` (missing languages come from the Bazarr profile, `[KD-7]`), and `[OQ-3]` (no immediate replacement search, `[KD-4]`) were resolved on 2026-09-08.

## Changelog

| Date       | Amendment                                                                                 | Sections affected | Reason                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| 2026-09-11 | Clarify durable passing records and independence from the transcode passed-file registry. | 8                 | Skip successful file versions across restarts without one feature suppressing the other's checks. |
| 2026-09-11 | Version subtitle scan verdicts with `SUBTITLE_SCAN_VERSION`.                              | 2–4, 8            | Re-analyze unchanged subtitles after behavior changes without resetting unrelated policy state.   |
