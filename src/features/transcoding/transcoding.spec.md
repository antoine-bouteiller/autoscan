---
title: Transcoding
status: amended
author: Antoine Bouteiller
date: 2026-08-14
related:
  - docs/project_structure.spec.md
  - docs/architecture/architecture.spec.md
  - src/providers/http/http.spec.md
  - src/providers/scheduler/scheduler.spec.md
  - src/providers/telegram/telegram.spec.md
  - src/domains/media/media.spec.md
  - src/features/subtitle_scan/subtitle_scan.spec.md
---

## 2. Problem Statement

Media releases vary in container, stream codec, language metadata, and subtitle shape, which prevents predictable Plex playback and subtitle availability. The feature accepts arr download notifications, scheduled or manual library scans, and serializes a durable FFmpeg workflow that produces a Plex-friendly MP4 and selected SRT files.

- `[G-1]` Normalize eligible media into MP4 with acceptable audio and language metadata.
- `[G-2]` Extract selected subtitles and identify forced subtitles.
- `[G-3]` Avoid duplicate work while accepting webhook, scheduled, and Telegram entry points; persist successfully passed file versions and skip their subsequent transcode analysis at the same scan version.
- `[G-4]` Replace source outputs only after validation and durable staging.

## 3. Key Design Decisions

| Decision                           | Choice                                                                                                                                                                            | Rationale                                                                                                                                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[KD-1.1]` Entry points            | Register Radarr/Sonarr webhooks, a twelve-hour scan, and `/transcode`; the Subtitle Scan feature owns `/subtitlescan`.                                                            | Arr downloads need prompt handling while library scans and operator commands cover media outside webhook delivery; separate command ownership prevents duplicate registration.                                                                                           |
| `[KD-2]` Work admission            | Use one scan permit and a scoped serial queue deduplicated by source path.                                                                                                        | A single worker avoids concurrent replacement of the same file, and scan admission prevents overlapping library traversal (`src/features/transcoding/services/transcode.service.ts:81`).                                                                                 |
| `[KD-3]` Command construction      | Probe streams, copy by default, and transcode only selected nonconforming streams; `.mp4` is mandatory.                                                                           | Stream-level work limits CPU while still making container and codec output predictable.                                                                                                                                                                                  |
| `[KD-4]` Output safety             | Write under `TRANSCODE_PATH`, validate generated video and audio, stage beside the source, then atomically install with rollback.                                                 | Separating production from installation protects the source library from partial FFmpeg output.                                                                                                                                                                          |
| `[KD-5]` Post-install notification | Refresh and rename through Radarr or Sonarr, then refresh Plex.                                                                                                                   | Each consumer needs to observe the installed media path and metadata after replacement.                                                                                                                                                                                  |
| `[KD-6.1]` Passed-file registry    | Persist a successful no-work verdict keyed by media content SHA-256, file extension, original language, and `TRANSCODE_SCAN_VERSION`; check it in `transcodeFile` before probing. | All entry points share this boundary. Content identity detects replacements; extension and original language affect stream selection (`src/features/transcoding/services/transcode.service.ts:148`). A version bump invalidates verdicts when analysis behavior changes. |

## 4. Principles & Intents

- `[PI-1]` Probe-led selection — ffprobe, rather than webhook data, determines streams and duration.
- `[PI-2]` Idempotent admission — a persisted passing file version at the current scan version bypasses probing and queue admission; the in-memory known-path set separately deduplicates active work.
- `[PI-3]` Interruptible preparation, durable commit — filesystem copies may stop safely; staging and installation maintain recovery artifacts if rollback cannot complete.
- `[PI-4]` Criteria-driven streams — language rules belong in audio and subtitle criteria rather than entry-point branches.

## 5. Non-Goals

- `[NG-1]` Hardware acceleration, GPU selection, or custom quality profiles.
- `[NG-2]` Use webhook payload stream metadata as the authoritative transcoding input.
- `[NG-3]` Concurrent transcoding of multiple source files.

## 6. Caveats

- `[C-1]` A missing source logs a typed error, refreshes Plex, and does not enter the queue.
- `[C-2]` Non-`Download` arr events are accepted but do not transcode.
- `[C-3]` Unresolved replacement markers or recovery artifacts stop processing so recovery material is preserved.
- `[C-4]` Sidecar subtitle analysis and Bazarr actions belong to `src/features/subtitle_scan/subtitle_scan.spec.md`; a transcode pass does not certify subtitle quality.
- `[C-5]` Identifying unchanged media still requires a streaming content hash and registry lookup; skipping means no ffprobe, stream selection, or queue work, not no filesystem reads. A changed extension or original language requires a fresh check, and changes to selection rules require bumping `TRANSCODE_SCAN_VERSION`, not clearing the registry.
- `[C-6]` A generated output is a new file version. Output validation alone does not certify a no-work verdict; the installed file is checked on its next submission and recorded only if no further work is required.

## 7. High-Level Components

| Component                   | Module type                 | Responsibility                                                | Public API surface                             |
| --------------------------- | --------------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| Feature routes              | HTTP routes                 | Receive Radarr and Sonarr events                              | `POST /radarr`, `POST /sonarr`                 |
| Scan job                    | Effect job/service          | Traverse Plex media under exclusive scan admission            | `runTranscodeProcess`, `startTranscodeProcess` |
| Transcode service and queue | Scoped Effect service       | Probe, select streams, enqueue, execute, and deduplicate jobs | `transcodeFile`, `TranscodeQueue`              |
| Post-process service        | Filesystem workflow         | Validate and durably install generated outputs                | `handlePostTranscode`                          |
| Telegram command            | Telegram command            | Start a transcode scan                                        | `/transcode`                                   |
| Passed-file registry        | Drizzle schema + repository | Persist successful transcode checks across restarts           | `transcodeScans`, repository functions         |

## 8. Detailed Design

### Feature routes

Both routes validate arr payloads. Only `Download` builds the source path, resolves original language through the media domain, and invokes `transcodeFile`; a false result refreshes the relevant Plex media type (`src/features/transcoding/webhooks/radarr.webhook.ts:11`, `src/features/transcoding/webhooks/sonarr.webhook.ts:12`). Other accepted events return the normal success response without work.

### Scan job

The scheduled feature runs on `0 */12 * * *` (`src/features/transcoding/feature.ts:16`). A scan traverses Plex sections and media, obtains complete media details, and submits each file. `TranscodeScan` grants one scan permit and releases it through finalization; `/transcode` starts that workflow in the tracked background set and reports whether admission succeeded (`src/features/transcoding/jobs/transcode.job.ts:99`, `src/features/transcoding/commands/transcode.command.ts:9`).

### Transcode service and queue

`transcodeFile` checks source existence, computes the versioned file identity, and returns `false` on a passed-file registry hit at the current scan version without probing or enqueueing. On a miss it probes FFmpeg streams, selects video/audio/subtitles, and only enqueues work when a codec, selected subtitle, or non-MP4 extension requires it (`src/features/transcoding/services/transcode.service.ts:173`). A successful check requiring no work persists the passing identity and returns `false`; a handled probe or selection failure returns `false` without recording a pass. Webhook callers retain their Plex refresh behavior for `false` results. The scoped queue records known paths, admits each path once, and processes jobs serially. Jobs write subtitles and the MP4 to `${TRANSCODE_PATH}/<fileName>/`; forced subtitles are renamed based on duration analysis before the main output is installed.

### Post-process service

Post-processing verifies the generated MP4 has video and audio, stages all outputs in the source directory, fsyncs stages and directory, backs up colliding originals, installs staged files, and rolls back on commit failure. It removes successful backups and output directory, preserves recovery artifacts on rollback failure, then refreshes/renames the matching arr record and refreshes Plex (`src/features/transcoding/services/helpers/post_process.ts:131`, `src/features/transcoding/services/helpers/post_process.ts:171`).

### Telegram command

`/transcode` uses the scan admission and background workflow described under Scan job. `/subtitlescan` is registered only by the Subtitle Scan feature.

### Passed-file registry

The feature owns `TRANSCODE_SCAN_VERSION = 1`, a positive integer constant shared by `/transcode`, scheduled scans, and arr webhooks through `transcodeFile`. Increment it when probing, stream selection, or other transcode-analysis behavior changes. Versions increase monotonically and are not reused for different behavior. A bump makes unchanged files eligible on their next submission; it does not launch a scan itself or force transcoding when the fresh check finds no work.

Only an exact version match can skip analysis. Old rows may remain, with no registry purge needed. The version is not a Telegram argument or environment setting and is independent of `SUBTITLE_SCAN_VERSION`.

`transcodeScans` lives in `src/database/schema.ts` and stores only successful checks:

```ts
export const transcodeScans = pgTable(
  'transcode_scans',
  {
    hash: text().notNull(), // hex SHA-256 of media content, streamed rather than buffered
    extension: text().notNull(), // exact extension used by container selection
    originalLanguage: text('original_language', { enum: ISO1 }).notNull(),
    scanVersion: integer('scan_version').notNull(),
    filePath: text('file_path').notNull(), // path at successful check; informational
    scannedAt: timestamp('scanned_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.hash, t.extension, t.originalLanguage, t.scanVersion] })]
)
```

Feature-local repository functions use `Database.use`, map database failures to `DatabaseQueryError`, and insert with `onConflictDoNothing`, following `src/domains/media/repositories/media.repository.ts`. Rows survive process restarts and have no time-based expiry; all lookups and writes include the current scan version. The table is created through a generated migration under `migrations/`.

```text
transcodeFile(file, originalLanguage):
  require source exists
  identity ← (sha256(file content), extension, originalLanguage, TRANSCODE_SCAN_VERSION)
  if registry contains identity → return false
  result ← probe and select streams             # failure is not a no-work verdict
  if result requires work → return queue.enqueue(result)
  if file changed during the check → return false without recording
  persist identity as passed
  return false
```

A file changing during hashing or analysis is not recorded and remains eligible on the next submission. Missing files, hash/probe/selection errors, rejected or pending queue work, failed jobs, and interrupted checks never create passing records. Registry failures are logged and do not create a hit; a failed write leaves the file eligible for another check. Queue acceptance is not completion, and the source hash is never marked passed merely because transcoding it succeeded. Installed outputs follow `[C-6]`.

The registry is independent of `subtitleScans`: media passing transcode criteria neither marks sidecar subtitles passed nor suppresses their scan. Conversely, a passing subtitle never suppresses transcode analysis.

## 9. Open Questions

N/A

## Changelog

| Date       | Amendment                                                                           | Sections affected | Reason                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| 2026-09-11 | Persist passed transcode file versions and assign `/subtitlescan` to Subtitle Scan. | 2–8               | Avoid re-analyzing successful files across scans and restarts, while keeping subtitle checks independent. |
| 2026-09-11 | Version passed-file records with `TRANSCODE_SCAN_VERSION`.                          | 2–4, 6, 8         | Recheck unchanged media when transcode behavior changes without purging saved results.                    |
