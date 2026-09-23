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

- `[G-1]` Analyze each eligible sidecar independently against the media's selected audio, keyed by full file path and scan version. Recheck current-version `sync_requested` files on a later eligible pass; never re-analyze a file already marked `passed`, `forced_removed`, `invalid`, or `inconclusive` at the current scan version.
- `[G-2]` Remove unwanted forced subtitles and re-synchronize out-of-sync subtitles through Bazarr.
- `[G-3]` For media missing subtitles for more than 3 days, alert on Telegram when none exist and translate through Bazarr when one exists.
- `[G-4]` Assign the Bazarr French preset to French-audio media and release the request after 7 days without a forced subtitle.

## 3. Key Design Decisions

| Decision                        | Choice                                                                                                                                                                                                                                           | Rationale                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[KD-1]` Entry points           | Register `Subtitle Scan` on `0 5 * * *` and the `/subtitlescan` Telegram command as the manual trigger for the same pass.                                                                                                                        | Subtitle changes arrive through Bazarr on its own schedule; a daily pass is enough to honor 3-day and 7-day windows while keeping the library traversal off the 12-hour jobs. One command name means one owner, so this feature is the sole registrant of `/subtitlescan`.                                                                                                                  |
| `[KD-2.1]` Scan identity        | Key the scan registry solely by full subtitle path; `SUBTITLE_SCAN_VERSION` is a lookup-validity filter.                                                                                                                                         | Path identity supersedes content hashing to skip registered files without reading their contents. Same-path replacements intentionally reuse a verdict only while its version remains current; renames and version changes require analysis. Full paths distinguish matching basenames in different directories.                                                                            |
| `[KD-3.1]` Registry scope       | Retain one latest analyzed record per `filePath`, with its scan version and verdict (`passed`, `forced_removed`, `sync_requested`, `invalid`, `inconclusive`); at the current version, skip terminal verdicts but recheck `sync_requested`.      | A `sync_requested` row records the request without suppressing a later validity check; replacing it with `invalid` after a failed recheck avoids repeating scans and alerts. A successful re-analysis at a changed version replaces the path's prior row, so no historical versions are retained. Identical contents at different paths are independent candidates, not one global verdict. |
| `[KD-4]` Unwanted forced        | An unregistered `.<lang>.srt` file (no `.forced.` marker) satisfying the forced heuristic is deleted through Bazarr; a `sync_requested` recheck records `invalid` and alerts instead.                                                            | A forced track in the full-subtitle slot hides the real gap from Bazarr; deleting through Bazarr rather than the filesystem updates its history so the language returns to the wanted list and is searched again. Files named `.forced.srt` are wanted by construction. Replacement search is left to Bazarr's wanted-search schedule.                                                      |
| `[KD-5]` Out-of-sync detection  | Superseded by `[KD-11]`: sibling start-timestamp matching is no longer a validation rule.                                                                                                                                                        | Siblings can agree while both belong to a different release; a single sidecar also needs an independent check.                                                                                                                                                                                                                                                                              |
| `[KD-6.1]` Sync target          | Superseded by `[KD-12]`: passed siblings are no longer timing references.                                                                                                                                                                        | Another subtitle's verdict is not evidence of alignment to audio.                                                                                                                                                                                                                                                                                                                           |
| `[KD-7]` Missing-subtitle clock | Persist the first time each `(bazarr item, language)` appears in Bazarr's wanted list and act once when that row is older than 3 days.                                                                                                           | Bazarr's wanted list is the authoritative "missing" signal for the configured profile but carries no age; a first-seen row gives a deterministic 3-day window and an `actedAt` marker makes the alert or translation happen once.                                                                                                                                                           |
| `[KD-8]` French-audio identity  | A media is French-audio when its media-domain `preferredLanguage` is `fr`.                                                                                                                                                                       | `preferredLanguage` is the audio Plex plays (`src/features/language_sync/language_sync.spec.md`); it defaults to the original language, so French films and French-dubbed media are both covered by one rule.                                                                                                                                                                               |
| `[KD-9]` Profile lifecycle      | Persist `(bazarr item, assignedAt, releasedAt)`; assign the preset once, release the profile after 7 days without a `fr` forced subtitle, and never reassign a released item.                                                                    | Without a terminal state the next pass would see French audio again and reassign the preset, producing a 7-day assign/release loop.                                                                                                                                                                                                                                                         |
| `[KD-10]` Bazarr boundary       | Add a thin `src/integrations/bazarr` client exposing wanted lists, item lookup by path, subtitle sync/translate/delete, and profile listing/assignment.                                                                                          | Bazarr is a vendor; the integration owns HTTP shape and validation while the feature owns policy, matching the arr and Plex clients (`docs/project_structure.spec.md` `[PI-3]`).                                                                                                                                                                                                            |
| `[KD-11]` Audio timing evidence | Compare each candidate's cue occupancy with speech activity from one preferred-language audio stream (fallback: first audio stream), across all populated five-minute windows.                                                                   | Timing correlation detects independent offsets and localized drift without transcription, sibling agreement, runtime downloads, or an extra system runtime. It cannot establish semantic correctness.                                                                                                                                                                                       |
| `[KD-12]` Timing lifecycle      | An aligned candidate passes; a misaligned new candidate gets one Bazarr sync request; a misaligned `sync_requested` recheck becomes `invalid` and alerts. Inconclusive analysis records terminal `inconclusive` and alerts once, without a sync. | Uncertain evidence must not certify a subtitle or consume its one-sync lifecycle; the audio, pinned detector, and path-keyed content are fixed, so a retry would repeat the same result and hold the 10-media cap.                                                                                                                                                                          |

## 4. Principles & Intents

- `[PI-1]` Incremental by default — file analysis over a library whose paths are all `passed`, `forced_removed`, or `invalid` at the current version performs directory listings and registry lookups only, without hashing or reading subtitle contents. Mutations are triggered by an unregistered path, a scan-version bump, or an elapsed window; `sync_requested` paths are deliberately rechecked.
- `[PI-2]` Bazarr owns subtitle files — deletion, sync, translation, and download are Bazarr requests; the feature never writes a subtitle file itself.
- `[PI-3]` Per-item resilience — a media, Bazarr, or filesystem failure is logged and the traversal continues, as in `src/features/language_sync/jobs/language.job.ts:20`.
- `[PI-4]` Act once — every time-window action (alert, translate, release) is recorded so a daily cadence never repeats it.

## 5. Non-Goals

- `[NG-1]` Running ffsubsync or rewriting subtitle timing locally. Local speech-activity validation is read-only; Bazarr still owns alignment.
- `[NG-2]` Choosing subtitle providers, scores, or languages beyond the profiles configured in Bazarr.
- `[NG-3]` Scanning subtitle streams embedded in the media container; only sidecar `.srt` files are analyzed.
- `[NG-4]` Reporting a per-pass summary to Telegram; only all-missing, invalid-subtitle, and inconclusive-subtitle alerts are user-facing.
- `[NG-5]` Transcription, translation verification, or proving that subtitle words match spoken dialogue. A timing pass is not a content-correctness verdict.

## 6. Caveats

- `[C-1]` Bazarr, Plex, and this service must see the same file paths; item lookup matches Bazarr's `path` against the Plex part path, like `src/integrations/arr/sonarr.service.ts:34`.
- `[C-2]` The forced heuristic requires the media duration, which comes from an ffprobe of the media file (`src/features/transcoding/services/helpers/subtitle.ts:18`). The probe runs only for media with at least one candidate: an unregistered or current-version `sync_requested` non-forced subtitle file.
- `[C-3]` Superseded by `[KD-11]`: a single sidecar is checked against speech activity, not passed on the forced check alone.
- `[C-4]` Same-path rewrites and replacements reuse a current-version `passed`, `forced_removed`, or `invalid` verdict. A current-version `sync_requested` path is instead rechecked on the next eligible pass using the same forced and audio timing heuristics; a definitively invalid recheck records terminal `invalid`, so it is never synced twice. Inconclusive rechecks record terminal `inconclusive`. Renaming or bumping the scan version makes any path eligible as unregistered.
- `[C-5]` Bazarr API paths and payloads (`/api/movies/wanted`, `/api/episodes/wanted`, `/api/subtitles`, `/api/system/languages/profiles`, `/api/movies`, `/api/episodes`) follow Bazarr 1.4; the integration validators pin the fields the feature reads and must be checked against the deployed version.
- `[C-6]` The French preset is resolved by name from `BAZARR_FRENCH_PROFILE`; a missing profile fails the French policy for the whole pass and is logged, while the scan and missing-subtitle policies still run.
- `[C-7]` Releasing a profile sets the Bazarr item's language profile to none; Bazarr then stops listing it as wanted, so the `released` state lives only in this feature's table.
- `[C-8]` Missing-subtitle rows are removed when the `(item, language)` leaves Bazarr's wanted list, so a subtitle that later disappears restarts the 3-day clock.
- `[C-9]` Translation uses the first present non-forced subtitle of the item as source; Bazarr chooses the translation engine.
- `[C-10]` Speech detection is heuristic: music, noise, dubbing, or different cue segmentation can weaken correlation. Silence, continuous activity, sparse cues, and ambiguous scores cannot certify timing. An uncorrelated window can be a detector failure, so it counts as misalignment only when uncorrelated windows outnumber aligned ones. Inconclusive files are never validated at the current version; one Telegram alert flags them for manual review.
- `[C-11]` Full selected-audio decoding adds temporary disk use and CPU work for each eligible media with candidates surviving the forced check. Speech activity is reused within that media/pass only, not persisted across passes. Real-movie validation of this detector and thresholds remains an evidence gap while SSH access is unavailable; historical sibling/ffsubsync observations below do not validate the new detector.

## 7. High-Level Components

```text
cron 0 5 * * *
  └─ scan job ── Plex sections ──► media details (media domain)
        ├─ file scan ─── path ▸ new or sync_requested ▸ forced? ▸ delete or alert
        │                                   ▸ one selected audio ▸ per-file speech timing
        │                                                        ▸ misaligned: sync or alert
        │                                                        ▸ aligned: record passed
        │                                                        ▸ inconclusive: record inconclusive
        ├─ missing policy ── Bazarr wanted ▸ first-seen rows ▸ >3d ▸ alert | translate
        └─ french policy ─── preferredLanguage=fr ▸ assign preset ▸ >7d no forced ▸ release
```

| Component             | Module type                   | Responsibility                                                           | Public API surface                                                                                 |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Scan job              | Effect job + Telegram command | Traverse Plex media and run the three policies per item under one permit | `runSubtitleScan`, `/subtitlescan`                                                                 |
| Scan registry         | Drizzle schema + repository   | Persist analyzed paths, missing first-seen rows, and profile lifecycle   | `subtitleScans`, `missingSubtitles`, `frenchProfiles`, repository functions                        |
| Analysis service      | Effect service                | Classify unregistered files and request Bazarr actions                   | `scanMediaSubtitles`                                                                               |
| Missing policy        | Effect service                | Reconcile wanted list with first-seen rows and act after 3 days          | `applyMissingPolicy`                                                                               |
| French profile policy | Effect service                | Assign the French preset and release it after 7 days without forced      | `applyFrenchProfilePolicy`                                                                         |
| Bazarr client         | Integration                   | Typed Bazarr HTTP surface                                                | `IBazarrClient`, `Bazarr` service key, `BAZARR_API_URL`, `BAZARR_API_KEY`, `BAZARR_FRENCH_PROFILE` |

## 8. Detailed Design

### Scan job

`runSubtitleScan` acquires a single scan permit (an item is skipped, not queued, when a pass is running), reads Plex sections and media, resolves `getCompleteMediaDetails` per item, and runs `scanMediaSubtitles` then `applyFrenchProfilePolicy` for each. `applyMissingPolicy` runs once per pass after traversal because it is driven by Bazarr's wanted list rather than by Plex items. Non-interruption failures per item are logged with the media title and the loop continues; the job's own failure is logged at the scheduler boundary.

For a safe initial rollout, traversal stops after 10 media with candidate non-forced subtitle paths at the current scan version across all Plex sections; candidates are unregistered paths and current-version `sync_requested` paths. Each movie/episode counts once regardless of its number of candidates, including analysis failures after candidates are identified. Media with no candidates and failures before eligibility is known do not consume the cap. This fixed cap applies to scheduled and manual passes; French-profile processing still runs for every traversed media. Each pass starts from the beginning in Plex order; `sync_requested` paths consume a recheck slot, while `passed`, `forced_removed`, and `invalid` paths let later passes advance without a cursor. Missing-subtitle reconciliation, translations, and alerts remain library-wide and run after the capped traversal.

- `[SO-4]` Media with only current-version `passed`, `forced_removed`, or `invalid` paths do not consume the 10-media scan budget, allowing later passes to reach new paths; rechecks consume the budget — demonstrated by `[VC-5]`.
- `[VC-5]` Job tests verify cached and forced-only media are skipped by the counter, new candidates are capped across sections even when analysis fails, metadata failures do not consume slots, and a following manual pass advances past passed paths registered by a scheduled pass. Service tests verify rechecks invoke the same scan counter — demonstrates `[SO-4]`.

`/subtitlescan` submits the same pass to `BackgroundTasks`, replies `Starting subtitle scan...` or `A subtitle scan is already running.` according to permit admission, and returns `{ step: 'idle' }`; it produces no report (`[NG-4]`).

### Scan registry

The feature owns `SUBTITLE_SCAN_VERSION = 3`, a positive integer constant shared by `/subtitlescan` and the scheduled pass. Version 3 invalidates sibling-based verdicts because agreement between subtitles no longer establishes timing validity. The next pass treats all paths without a verdict at that exact version as unregistered, including paths with older `passed`, `forced_removed`, `sync_requested`, or `invalid` verdicts. An older sync request therefore does not consume the version-3 sync attempt. Old verdicts are not skip signals, and no subtitle serves as a timing reference. A bump does not launch a pass itself; the schedule or command does.

Version bumps increase monotonically and are not reused; compatible relaxations may retain the current version. A row is valid only when its stored version matches the current version; a successful re-analysis replaces the row for that path with the new version and verdict, so no historical versions are retained and no registry purge is needed. The version is not a Telegram argument or environment setting. It does not reset `missingSubtitles` clocks/action markers or `frenchProfiles` lifecycle state, and it does not invalidate transcode results.

```ts
export const subtitleVerdictEnum = pgEnum('subtitle_verdict', ['passed', 'forced_removed', 'sync_requested', 'invalid'])
export const bazarrKindEnum = pgEnum('bazarr_kind', ['movie', 'episode'])

export const subtitleScans = pgTable('subtitle_scans', {
  filePath: text('file_path').primaryKey(),
  scanVersion: integer('scan_version').notNull(),
  verdict: subtitleVerdictEnum().notNull(),
  scannedAt: timestamp('scanned_at').notNull(),
})

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

Repository functions follow `src/domains/media/repositories/media.repository.ts`: each wraps Drizzle in `Database.use` and maps rejections to `DatabaseQueryError`. Lookups require both `filePath` and the current scan version. `subtitleScans` writes use `onConflictDoUpdate({ target: subtitleScans.filePath, set: row })`, replacing the entire row after a successful analysis so each full path has one latest record. The tables live in `src/database/schema.ts` with migrations under `migrations/`. `migrations/20260921190858_scan_path_primary_keys` updates both scan tables, retaining the latest record per full path by `scanned_at DESC, ctid DESC` before making inline `filePath` its sole primary key. No version bump is needed for the identity change.

Terminal records survive restarts and have no time-based expiry. Scheduled and manual passes use the same registry: a `passed`, `forced_removed`, `invalid`, or `inconclusive` path is never read, analyzed, or actioned again at that scan version, even when another sidecar is a candidate. A `sync_requested` path is rechecked on the next eligible pass; when aligned it is replaced with `passed`, when still invalid it becomes `invalid`, and when inconclusive it becomes `inconclusive`. A rename or scan-version bump is a new candidate; a content rewrite at a terminal path is not. Failed, interrupted, or inconclusive analysis never records `passed`; failed or interrupted analysis records nothing, and a failed registry write leaves the path eligible for a later pass.

`migrations/20260923115940_invalid_subtitle_verdict` adds `invalid` to the PostgreSQL enum without changing existing records. No scan-version bump is needed: existing `sync_requested` paths transition on their next eligible recheck. `migrations/20260923133420_inconclusive_subtitle_verdict` likewise adds `inconclusive`.

This registry is independent of the passed-file registry in `src/features/transcoding/transcoding.spec.md`. A successfully checked media file skips further transcode analysis for that identity, not subtitle analysis or the missing/French policies. Transcoding never marks extracted sidecars as passed: new sidecar paths enter this scan as unregistered candidates. Conversely, a passing subtitle does not certify the media's transcode criteria.

### Analysis service

`scanMediaSubtitles(details)` lists sidecars `<base>.<lang>.srt` and `<base>.<lang>.forced.srt` in the media directory, then:

```text
version ← SUBTITLE_SCAN_VERSION
for each non-forced sidecar: known ← registry.get(path, version)
candidates ← sidecars with (known = undefined or known.verdict = sync_requested) and no `.forced.` marker
if candidates is empty → return           # PI-1: no content reads, probe, audio decode, or Bazarr call
item ← resolve Bazarr item once by media path; if absent → warn and return
(duration, streams) ← ffprobe(details.file)
read candidate contents only; never hash contents or read terminal paths
for each candidate:
  if isForcedSubtitleContent(content, duration):
    if known.verdict = sync_requested → record(path, version, invalid); alertInvalid(path) # no delete or sync
    else → bazarr.deleteSubtitle(item, subtitle); record(path, version, forced_removed)
remaining ← candidates that did not satisfy the forced heuristic
if remaining is empty → return
selected ← first audio stream matching preferredLanguage, else first audio stream
if selected has no stream index → warn; record(path, version, inconclusive); alertInconclusive(path) for remaining; return
activity ← ffmpeg.speechActivity(details.file, selected.index) # once for all remaining candidates
for each remaining candidate:
  timing ← assessSubtitleTiming(content, activity)
  if timing = inconclusive → record(path, version, inconclusive); alertInconclusive(path)
  if timing = aligned → record(path, version, passed)
  if timing = misaligned:
    if known.verdict = sync_requested → record(path, version, invalid); alertInvalid(path)
    else → bazarr.syncSubtitle(item, subtitle); record(path, version, sync_requested)
```

The shared `isForcedSubtitleContent` heuristic is unchanged: fewer than 3 cues per minute or under 15% screen-time ratio means forced. Both forced analysis and timing parsing handle LF and CRLF separators. Explicit `.forced.srt` sidecars remain excluded. The Bazarr item is resolved once per media by path (`getMovieByPath` or `getEpisodeByPath`); an unresolvable item logs a warning and records nothing, so the media is retried next pass. Delete and sync use the item's subtitle entry matching the full path. A missing entry or failed request records no success verdict. A file that is deleted, newly sync-requested, or still-invalid after a sync request is never recorded as `passed` in the same pass.

A current-version `sync_requested` candidate is rechecked with the same forced and audio timing heuristics. If either marks it invalid, record `invalid` and send one best-effort plain-text message to `TELEGRAM_CHAT_ID`: `Invalid subtitle for <media title> (<language>)`; neither delete nor sync it. An aligned rechecked candidate is recorded as `passed`; an inconclusive check or recheck records `inconclusive` and sends one best-effort `Inconclusive subtitle check for <media title> (<language>)` message to the same chat. Invalid and inconclusive paths skip future scans and alerts at the current version. Newly misaligned candidates receive a Bazarr sync request and `sync_requested` record, but no Telegram sync notification. Successful Bazarr sync and delete requests, passing records, invalid alerts, and per-file timing windows/scores/offsets are logged. Telegram failures are logged without changing the persisted `invalid` verdict or stopping other candidates; failed alerts are not retried.

### Audio evidence contract

The FFmpeg integration owns decoding and speech detection; the feature owns timing thresholds and Bazarr policy. The boundary in `src/integrations/ffmpeg/ffmpeg.service.ts` is:

```ts
interface SpeechActivity {
  readonly duration: number // seconds from decoded sample count, including leading silence
  readonly intervals: readonly [number, number][] // speech start/end, seconds on the media timeline
}
// IFfmpegClient.speechActivity(input, streamIndex) yields SpeechActivity or an integration error.
```

The selected stream is the first probed audio stream whose normalized language equals `details.preferredLanguage`, falling back to the first audio stream. There is no per-subtitle language selection or all-track comparison. One extraction serves every surviving candidate of that media in that pass, including a lone subtitle; no persistent audio cache is created. Missing audio records surviving candidates as `inconclusive`. Probe, decode, or detector failures propagate to per-media failure logging without producing timing verdicts; earlier forced actions are not rolled back.

FFmpeg decodes the selected stream to mono signed 16-bit little-endian PCM at 16 kHz, preserving the media timeline and inserting leading silence where needed. Decode and filter work are single-threaded, with a 30-minute subprocess timeout. The PCM file lives in an Effect-scoped temporary directory; completion, failure, or interruption releases it. The reader processes bounded PCM chunks using Silero VAD v6.2.3 with the official `onnxruntime-web` 1.30.0 WASM backend, configured for one CPU thread and no proxy worker. Each 32 ms frame supplies 512 samples normalized to float32, prepended with the preceding 64 samples; recurrent state `[2, 1, 128]` and context reset for each audio file. A speech probability of at least 0.5 marks a frame as voiced; contiguous voiced frames become intervals, without segment padding or minimum-duration filtering. The last frame is zero-padded for inference but its duration is clipped to the actual sample count. Invalid outputs and initialization/inference failures fail analysis rather than becoming silence.

Bun embeds the pinned ONNX model and the official WASM asset with `type: 'file'` imports. The runtime receives those bytes explicitly, so no model/runtime URL is used. Model provenance, SHA-256 and MIT license are in `src/integrations/ffmpeg/models/`; the Nix package includes the Silero and ONNX Runtime license/notices. There is no Python runtime, GPU, account, transcription service, or new environment setting. Each session and PCM file is scope-owned; interruption waits for the current short inference before releasing the session, while the bounded reader yields between chunks.

### Timing assessment contract

`assessSubtitleTiming(content, activity)` in `services/subtitle_timing.ts` returns `aligned | misaligned | inconclusive`, with per-window start, best in-tolerance correlation, best searched correlation, best offset, and verdict. Cue text is not compared to dialogue.

- Parse SRT cue intervals, requiring valid timestamps and an end after each start. Invalid/empty input or invalid decoded duration is inconclusive in this timing stage; the pre-existing forced heuristic still runs first.
- Convert cue and speech intervals into binary 100 ms occupancy bins (start rounded down, end rounded up). Compare using the phi coefficient, i.e. Pearson correlation of binary activity, not raw overlap or cue-index matching.
- Partition the decoded timeline into consecutive five-minute windows, including the final partial window. Count cues overlapping each window, including cues starting in the previous window. Skip only windows containing no cues; one to four overlapping cues contribute an inconclusive window, rather than disappearing from the overall result. Score windows with at least five overlapping cues. Each usable correlation needs at least 30 active and 30 inactive bins in each signal. Silence or near-continuous activity therefore provides no usable score.
- Search offsets from -10 to +10 seconds inclusively in 100 ms steps. Let `aligned` be the best usable score within inclusive ±500 ms and `best` the best over the full search. A window with no usable in-tolerance score is inconclusive. Otherwise, `best >= 0.2` and `best - aligned >= 0.1` indicates stronger shifted timing and is misaligned; otherwise `best < 0.1` is uncorrelated. If neither applies, `aligned >= 0.2` is aligned; intermediate scores are inconclusive. The shifted-timing test takes precedence over the aligned threshold.
- No populated windows, or only inconclusive windows, yields inconclusive. With at least one conclusive window, more than 10% of total cue duration beyond decoded audio duration is misaligned. Otherwise any misaligned (shifted) window, or more uncorrelated than aligned windows, makes the whole subtitle misaligned; all assessed windows must be aligned to pass. A mix of aligned with inconclusive or minority uncorrelated windows stays inconclusive. This prevents a whole-movie average from hiding a localized mismatch.

Inconclusive is persisted as terminal `inconclusive` for both unregistered and `sync_requested` candidates. It sends one alert, never requests a sync, and never writes `passed`; a rename or scan-version bump makes the path eligible again.

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

### Timing and notification acceptance

- `[SO-1]` Superseded by `[SO-6]`: sibling timing agreement is no longer the shipped validation outcome.
- `[VC-1]` Superseded by `[VC-8]` and `[VC-9]`: historical Anora sibling matching, pair symmetry, one-to-one matching, and the 50% boundary are not acceptance criteria for audio validation.
- `[VC-2]` LF and CRLF representations produce identical forced verdicts and equivalent audio-timing results in shared-helper and timing tests — demonstrates `[SO-6]`.
- `[SO-3]` A current-version `sync_requested` subtitle is rechecked without a version bump: an invalid recheck records terminal `invalid` and alerts Telegram without a delete or repeat sync, an aligned recheck passes, and an inconclusive recheck records terminal `inconclusive`.
- `[VC-4]` Service tests verify the configured recipient, exact invalid-alert media title and subtitle language, absence of a file path, no Telegram notification for newly requested syncs, skipping invalid paths without content reads, probes, Bazarr lookups, scan-budget consumption, or repeated alerts, no delete/re-sync of an invalid recheck, passing of an aligned recheck, terminal `inconclusive` with one inconclusive alert and no sync, re-probe, or scan-budget consumption for an inconclusive check or recheck, extraction failures leaving `sync_requested` unchanged, and continued scanning with persisted `invalid` verdicts after Telegram failure — demonstrates `[SO-3]`.
- `[SO-5]` `passed`, `forced_removed`, and `invalid` subtitle paths skip hashing and content reads across passes and restarts, including same-path replacements and when another sidecar is eligible; current-version `sync_requested` paths are the deliberate recheck exception — demonstrated by `[VC-6]` and `[VC-7]`.
- `[VC-6]` Discovery and service tests verify no terminal-path contents are read, even with a new candidate present; all-terminal media skip probing and speech extraction; renamed paths and identical contents at different paths are independently eligible; version 3 rechecks older verdicts; and `sync_requested` paths use the forced and audio timing heuristics again — demonstrates `[SO-5]`.
- `[VC-7]` `tests/features/subtitle_scan/repositories/subtitle_scan.repository.spec.ts` verifies that a version-change upsert replaces the full row for a path; the combined migration regression is covered by `tests/features/transcoding/repositories/transcode_scan.repository.spec.ts` — demonstrates `[SO-5]`.
- `[SO-6]` Each surviving sidecar, including a lone subtitle or two identical wrong-release tracks, is independently evaluated against selected-audio speech timing. All populated windows contribute, and inadequate evidence cannot certify a pass — demonstrated by `[VC-2]`, `[VC-8]`, and `[VC-9]`.
- `[VC-8]` `tests/features/subtitle_scan/services/subtitle_timing.spec.ts` covers independent aligned timing and inclusive 500 ms tolerance, large positive/negative offsets, unrelated timing, a shifted final window after aligned earlier windows, silent/continuous speech, sparse/malformed cues, mixed dense-aligned/sparse-shifted windows, cues overlapping window boundaries, mixed aligned/inconclusive windows, a minority uncorrelated window staying inconclusive while an uncorrelated majority is misaligned, and substantial cue duration beyond decoded audio. No usable windows remains inconclusive even with out-of-duration cues — demonstrates `[SO-6]`.
- `[VC-9]` `tests/features/subtitle_scan/services/subtitle_scan.service.spec.ts` verifies a lone aligned subtitle passes, identical misaligned sidecars each request sync, each file gets its own verdict, preferred audio is selected with first-audio fallback, one extraction serves multiple candidates, and absent audio or inconclusive evidence records `inconclusive` and alerts without a sync — demonstrates `[SO-6]`.
- `[SO-7]` Local speech extraction is bounded and scoped, reuses existing system runtimes, and leaves no persistent PCM cache — demonstrated by `[VC-10]`.
- `[VC-10]` `tests/integrations/ffmpeg/ffmpeg.service.spec.ts` checks real selected-stream decoding and stereo downmixing, timeline preservation, invalid stream/duration and decode/model failures, bounded PCM/frame handling, and resource release after success, failure, or interruption. A pinned speech fixture matches independently computed Silero frame intervals, repeated calls reset state, and a compiled detector runs from an unrelated working directory with fetch forbidden and embedded model assets. The extraction command must retain single-thread decode/filter flags and its 30-minute timeout — demonstrates `[SO-7]`.

Historical motivation, not acceptance evidence for version 3: Anora's complete downloaded sidecars had 2,435 English and 2,471 French cues, 98.03% positional divergence, and 1,348 starts matching one-to-one within 300 ms (55.36% of the shorter track). Full-track ffsubsync estimated offsets of +10 ms (English) and 0 ms (French), both at framerate scale 1.000, while positional divergence stayed at 97.95%. This explains why subtitle-to-subtitle positional checks were misleading; it does not establish the accuracy of the new speech detector. New real-movie validation remains blocked as noted in `[C-11]`.

## 9. Open Questions

N/A — `[OQ-1]` (manual trigger: this feature owns `/subtitlescan`, folded into `[KD-1]`), `[OQ-2]` (missing languages come from the Bazarr profile, `[KD-7]`), and `[OQ-3]` (no immediate replacement search, `[KD-4]`) were resolved on 2026-09-08.

## Changelog

| Date       | Amendment                                                                                           | Sections affected | Reason                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| 2026-09-11 | Clarify durable passing records and independence from the transcode passed-file registry.           | 8                 | Skip successful file versions across restarts without one feature suppressing the other's checks. |
| 2026-09-11 | Version subtitle scan verdicts with `SUBTITLE_SCAN_VERSION`.                                        | 2–4, 8            | Re-analyze unchanged subtitles after behavior changes without resetting unrelated policy state.   |
| 2026-09-17 | Temporarily cap Plex traversal at 10 media per pass; keep missing-subtitle processing library-wide. | 8                 | Limit initial scan impact.                                                                        |
