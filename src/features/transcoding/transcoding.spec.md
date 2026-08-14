---
title: Transcoding
status: implemented
author: Antoine Bouteiller
date: 2026-08-14
related:
  - docs/project_structure.spec.md
  - docs/architecture/architecture.spec.md
  - src/providers/http/http.spec.md
  - src/providers/scheduler/scheduler.spec.md
  - src/providers/telegram/telegram.spec.md
  - src/domains/media/media.spec.md
---

## 2. Problem Statement

Media releases vary in container, stream codec, language metadata, and subtitle shape, which prevents predictable Plex playback and subtitle availability. The feature accepts arr download notifications, scheduled or manual library scans, and serializes a durable FFmpeg workflow that produces a Plex-friendly MP4 and selected SRT files.

- `[G-1]` Normalize eligible media into MP4 with acceptable audio and language metadata.
- `[G-2]` Extract selected subtitles and identify forced subtitles.
- `[G-3]` Avoid duplicate work while accepting webhook, scheduled, and Telegram entry points.
- `[G-4]` Replace source outputs only after validation and durable staging.

## 3. Key Design Decisions

| Decision                           | Choice                                                                                                                            | Rationale                                                                                                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[KD-1]` Entry points              | Register Radarr/Sonarr webhooks, a twelve-hour scan, and `/transcode` / `/subtitlescan`.                                          | Arr downloads need prompt handling while library scans and operator commands cover media outside webhook delivery; registration exposes all four surfaces (`src/features/transcoding/feature.ts:11`). |
| `[KD-2]` Work admission            | Use one scan permit and a scoped serial queue deduplicated by source path.                                                        | A single worker avoids concurrent replacement of the same file, and scan admission prevents overlapping library traversal (`src/features/transcoding/services/transcode.service.ts:81`).              |
| `[KD-3]` Command construction      | Probe streams, copy by default, and transcode only selected nonconforming streams; `.mp4` is mandatory.                           | Stream-level work limits CPU while still making container and codec output predictable.                                                                                                               |
| `[KD-4]` Output safety             | Write under `TRANSCODE_PATH`, validate generated video and audio, stage beside the source, then atomically install with rollback. | Separating production from installation protects the source library from partial FFmpeg output.                                                                                                       |
| `[KD-5]` Post-install notification | Refresh and rename through Radarr or Sonarr, then refresh Plex.                                                                   | Each consumer needs to observe the installed media path and metadata after replacement.                                                                                                               |

## 4. Principles & Intents

- `[PI-1]` Probe-led selection — ffprobe, rather than webhook data, determines streams and duration.
- `[PI-2]` Idempotent admission — an already conformant file or a known source path produces no duplicate queue work.
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
- `[C-4]` The subtitle scan reports matching-subtitle absence and substantial timing divergence; it does not modify subtitles.

## 7. High-Level Components

| Component                   | Module type           | Responsibility                                                | Public API surface                             |
| --------------------------- | --------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| Feature routes              | HTTP routes           | Receive Radarr and Sonarr events                              | `POST /radarr`, `POST /sonarr`                 |
| Scan job                    | Effect job/service    | Traverse Plex media under exclusive scan admission            | `runTranscodeProcess`, `startTranscodeProcess` |
| Transcode service and queue | Scoped Effect service | Probe, select streams, enqueue, execute, and deduplicate jobs | `transcodeFile`, `TranscodeQueue`              |
| Post-process service        | Filesystem workflow   | Validate and durably install generated outputs                | `handlePostTranscode`                          |
| Telegram commands           | Telegram commands     | Start a scan and report subtitle issues                       | `/transcode`, `/subtitlescan`                  |

## 8. Detailed Design

### Feature routes

Both routes validate arr payloads. Only `Download` builds the source path, resolves original language through the media domain, and invokes `transcodeFile`; a false result refreshes the relevant Plex media type (`src/features/transcoding/webhooks/radarr.webhook.ts:11`, `src/features/transcoding/webhooks/sonarr.webhook.ts:12`). Other accepted events return the normal success response without work.

### Scan job

The scheduled feature runs on `0 */12 * * *` (`src/features/transcoding/feature.ts:16`). A scan traverses Plex sections and media, obtains complete media details, and submits each file. `TranscodeScan` grants one scan permit and releases it through finalization; `/transcode` starts that workflow in the tracked background set and reports whether admission succeeded (`src/features/transcoding/jobs/transcode.job.ts:99`, `src/features/transcoding/commands/transcode.command.ts:9`).

### Transcode service and queue

`transcodeFile` checks source existence, probes FFmpeg streams, selects video/audio/subtitles, and only enqueues work when a codec, selected subtitle, or non-MP4 extension requires it (`src/features/transcoding/services/transcode.service.ts:173`). The scoped queue records known paths, admits each path once, and processes jobs serially. Jobs write subtitles and the MP4 to `${TRANSCODE_PATH}/<fileName>/`; forced subtitles are renamed based on duration analysis before the main output is installed.

### Post-process service

Post-processing verifies the generated MP4 has video and audio, stages all outputs in the source directory, fsyncs stages and directory, backs up colliding originals, installs staged files, and rolls back on commit failure. It removes successful backups and output directory, preserves recovery artifacts on rollback failure, then refreshes/renames the matching arr record and refreshes Plex (`src/features/transcoding/services/helpers/post_process.ts:131`, `src/features/transcoding/services/helpers/post_process.ts:171`).

### Telegram subtitle scan

`/subtitlescan` starts a background analysis over Plex media. It reports missing English SRTs and French/English subtitle timing divergence above 300ms for most aligned entries, or confirms matching subtitles (`src/features/transcoding/commands/subtitle_scan.command.ts:122`).

## 9. Open Questions

N/A
