---
title: Transcoding Feature
version: 1.0
date_created: 2026-05-08
last_updated: 2026-05-08
tags: [feature, ffmpeg, radarr, sonarr, telegram, http, scheduler]
---

# Introduction

The transcoding feature normalizes media files into a Plex-friendly shape: a single MP4 container with kept video
streams, language-targeted audio (re-encoded to AAC where required), and extracted SRT subtitles. It is triggered
by Radarr/Sonarr Download webhooks, a 12-hourly library sweep, and a Telegram command.

## 1. Purpose & Scope

Convert and prune media files to deterministic codecs and containers, extract relevant subtitles, write outputs into
`TRANSCODE_PATH`, then atomically replace the source file and notify Plex/Radarr/Sonarr. Out of scope: hardware
acceleration, custom quality profiles, GPU selection.

## 2. Definitions

- **Probe**: `ffprobe` introspection of streams + duration.
- **Remux**: Same codec, different container (e.g. `.mkv` -> `.mp4`).
- **Transcode**: Re-encode (e.g. DTS audio -> AAC).
- **Stream selection**: Pick which audio/subtitle streams to keep based on language criteria.
- **Forced subtitle**: SRT with low lines-per-minute (< 3) or low screen-time ratio (< 15%); renamed `*.lang.forced.srt`.
- **Original language**: ISO-639-1 code resolved from TMDB.

## 3. Requirements, Constraints & Guidelines

- **REQ-001** Expose `POST /radarr` and `POST /sonarr` webhooks accepting `Test`, `Download`, and delete-style events.
- **REQ-002** Run a scheduled `Transcode` job on cron `0 0 */12 * * *` that walks every Plex section and submits each
  media to `transcodeFile`.
- **REQ-003** Expose Telegram `/transcode` to trigger a full library sweep manually and `/subtitlescan` to report
  missing or out-of-sync external subtitles.
- **REQ-004** All ffmpeg outputs MUST be written to `${TRANSCODE_PATH}/<fileName>/` before being copied back next to
  the source file. The source file is removed only on a successful post-process probe.
- **REQ-005** Output container MUST be `.mp4`. Output audio codecs MUST be in {`aac`, `ac3`, `eac3`}.
- **REQ-006** Audio streams without a `language` tag MUST be tagged with the original language (ISO-639-2/B).
- **CON-001** Only one transcode job runs at a time: a process-level `isScanning` guard plus a singleton FIFO
  `TranscodeQueue` deduplicating by `file`.
- **CON-002** ffprobe is the source of truth for stream selection; webhook payloads provide path + TMDB id only.
- **GUD-001** Stream selection is criteria-driven (`Criteria[][]` in `services/helpers/utils.ts`). Add new languages
  by editing audio/subtitle helpers, not by branching in the service.
- **GUD-002** All filesystem and process calls MUST go through `safe*` helpers (`safeRenameSync`, `safeRmSync`,
  `safeExistsSync`, `spawnPromise`) so failures are returned as `Error` values, not thrown.
- **PAT-001** The service is idempotent through `getTranscodeCommand`: when no audio/video transcode is needed, no
  subtitles are extractable, and the extension is already `.mp4`, the function returns `undefined` and the queue is
  not touched.

## 4. Interfaces & Data Contracts

### HTTP Routes

| Method | Path      | Validator                             | Accepted `eventType`                                              |
| ------ | --------- | ------------------------------------- | ----------------------------------------------------------------- |
| POST   | `/radarr` | `@/integrations/arr/radarr.validator` | `Test`, `Download`, `MovieFileDelete`, `MovieDelete`              |
| POST   | `/sonarr` | `@/integrations/arr/sonarr.validator` | `Test`, `Download`, `EpisodeFileDelete`, `Rename`, `SeriesDelete` |

Only `Download` triggers transcoding. Other event types are accepted by the validator and ignored by the handler
(returns `{ message: 'ok' }`). When `transcodeFile` returns `false` (no work to do), the webhook falls back to
`plexClient.refreshSections(file, mediaType)`.

### Scheduled Jobs

| Name        | Pattern          | Handler               | Behaviour                                                       |
| ----------- | ---------------- | --------------------- | --------------------------------------------------------------- |
| `Transcode` | `0 0 */12 * * *` | `runTranscodeProcess` | Iterates Plex sections + media, calls `transcodeFile` per item. |

### Telegram Commands

| Command         | Handler               | Effect                                                                             |
| --------------- | --------------------- | ---------------------------------------------------------------------------------- |
| `/transcode`    | `transcodeCommand`    | If a scan is running, replies and exits. Otherwise launches `runTranscodeProcess`. |
| `/subtitlescan` | `subtitleScanCommand` | Reports media missing English SRTs or with FR/EN tracks > 300ms desync.            |

### Service API (`services/transcode.service.ts`)

- `transcodeFile({ file, mediaTitle, originalLanguage, mediaType })`: Probes the file, computes a command, enqueues a
  job. Returns `true` if a job was enqueued, `false` otherwise (file missing, no work needed, error logged).
- `transcodeQueue.enqueue(job: TranscodeJob)`: Internal FIFO singleton. Skips identical-file duplicates with a warning.
- `transcodeQueue.getStatus()`: `{ currentJob?, isProcessing, queueLength }`.

### `TranscodeJob` Shape

```ts
interface TranscodeJob {
  command: string[] // ffmpeg args after `-i input`
  duration?: number // from ffprobe; used for forced-subtitle detection
  file: string // absolute source path
  mediaTitle: string
  mediaType: 'movie' | 'show'
  originalLanguage: ISOCode1
  subtitlesToExtract: { index: number; language: ISOCode1 }[]
}
```

### FFmpeg Pipeline

1. `ffprobe` -> `{ duration, streams }`.
2. `processVideoStreams`: drop `mjpeg` / `png` / `gif`; map remaining `0:v:i`. Trigger transcode if any drop occurred.
3. `processAudioStreams`: per language criteria, map best stream; if codec not in `{aac,ac3,eac3}` add `-c:a:i aac`;
   tag undefined languages with `iso1ToIso2B(originalLanguage)`.
4. `processSubtitleStreams`: collect SRT/ASS streams per language criteria (FR forced when original is FR, else
   non-forced/non-SDH EN + FR).
5. Pre-pend `-c copy`, build final command. If extension is not `mp4`, force execution.
6. Worker extracts each subtitle to `${TRANSCODE_PATH}/<name>/<name>.<lang>.srt`, runs `isForcedSubtitle` to rename
   to `*.forced.srt` when applicable, then runs the main transcode to `${TRANSCODE_PATH}/<name>/<name>.mp4`.
7. `handlePostTranscode`: re-probe output; on success delete source, copy outputs next to source, refresh
   Radarr/Sonarr (`refreshMovie`+`renameMovie` / `refreshSeries`+`renameSeries`) then `plexClient.refreshSections`.

## 5. Acceptance Criteria

- **AC-001** Given a Radarr `Download` event, when payload validates, then `transcodeFile` is invoked with the joined
  `folderPath` + `relativePath`, the resolved TMDB language, and `mediaType: 'movie'`.
- **AC-002** Given a Sonarr `Download` event, when payload validates, then `transcodeFile` is invoked with the joined
  `series.path` + `episodeFile.relativePath`, and `mediaType: 'show'`.
- **AC-003** Given the cron pattern `0 0 */12 * * *`, the job iterates every Plex section, fetches metadata, and
  submits each file to the queue; concurrent invocations are skipped via `isScanning`.
- **AC-004** Given the `/transcode` Telegram command, when no scan is running it kicks off `runTranscodeProcess`
  asynchronously; otherwise it replies "already running" and exits.
- **AC-005** Given a file already in `.mp4` with acceptable codecs, language tags, and no extractable subtitles,
  `transcodeFile` returns `false` and no ffmpeg call is made.
- **AC-006** Given a successful transcode, the source file is removed and the output mp4 + extracted SRTs sit in the
  source directory; the temporary `${TRANSCODE_PATH}/<name>/` directory is purged.
- **AC-007** Given a missing source file, `FileNotFoundError` is logged, Plex is asked to refresh, and the queue is
  not touched.

## 6. Test Automation Strategy

- Unit-test helpers (`audio.ts`, `video.ts`, `subtitle.ts`, `utils.ts`, `post_process.ts`) by feeding crafted
  `FFprobeStream[]` arrays and asserting the produced command + `shouldExecute` flag.
- Mock `FFMPEG_CLIENT`, `PLEX_CLIENT`, `RADARR_CLIENT`, `SONARR_CLIENT` via the container; assert call ordering in
  `handlePostTranscode`.
- Validator tests: every `eventType` permutation parses; malformed bodies reject with `ValidationError`.

## 7. Rationale & Context

Plex Direct Play requires MP4 + AAC (or AC3/EAC3) and embedded language metadata. Source releases are inconsistent:
DTS-HD audio, MKV containers, untagged streams, multiple SDH/forced subtitles. The pipeline encodes only what must
change (`-c copy` baseline, plus per-stream overrides) to minimize CPU. Output goes to a separate `TRANSCODE_PATH` so
a partial run cannot corrupt the source library; the source is replaced only after a post-process re-probe confirms
the output has both video and audio streams.

## 8. Dependencies & External Integrations

### External Systems

- **EXT-001** Radarr - movie webhook source; queried for `getMovieByPath` / `refreshMovie` / `renameMovie`.
- **EXT-002** Sonarr - episode webhook source; queried for `getSeriesByPath` / `refreshSeries` / `renameSeries`.
- **EXT-003** TMDB - resolves `originalLanguage` via `getMediaLanguage(tmdbId, mediaType)`.
- **EXT-004** Plex - `getSections`, `getSectionMedia`, `refreshSections`.
- **EXT-005** FFmpeg / FFprobe - subprocess via `spawnPromise`.

### Internal Dependencies

- **DEP-001** `@/integrations/arr` - Radarr/Sonarr clients + webhook validators.
- **DEP-002** `@/integrations/ffmpeg` - `FfmpegClient`, `FFprobeStream` validator.
- **DEP-003** `@/integrations/plex`, `@/integrations/tmdb`, `@/integrations/telegram`.
- **DEP-004** `@/providers/http` - `postRoute`, request/reply types, `success`.
- **DEP-005** `@/providers/scheduler` - cron registration via `defineFeature`.
- **DEP-006** `@/providers/telegram` - command registration via `defineFeature`.
- **DEP-007** `@/domains/media/services/metadata.service` - `getMediaLanguage`, `getCompleteMediaDetails`.
- **DEP-008** `@/config/env` - `TRANSCODE_PATH` (required string).

## 9. Examples & Edge Cases

Radarr `Download` payload (minimum fields):

```json
{
  "eventType": "Download",
  "movie": { "folderPath": "/movies/Inception (2010)", "title": "Inception", "tmdbId": 27205 },
  "movieFile": { "relativePath": "Inception.2010.mkv" }
}
```

Decision examples:

- Source `mkv`, single AAC EN audio with `language=eng` tag, no subtitles: extension forces `shouldExecute=true`,
  command is `-c copy -map 0:v:0 -map 0:a:0` -> remux only.
- Source `mp4`, DTS audio: audio helper emits `-c:a:0 aac`, video stays copy.
- Source `mkv`, FR original with embedded forced FR subtitle: only the forced FR SRT is extracted; main audio is the
  FR stream.
- Forced subtitle detection: an extracted SRT with < 3 lines/minute or < 15% screen-time is renamed to
  `<name>.<lang>.forced.srt`.

## 10. Validation Criteria

- `bun run check` and `bun run test` succeed.
- Webhook validators round-trip every documented `eventType`.
- `getTranscodeCommand` returns `undefined` for an already-conformant file (no queue entry, no ffmpeg invocation).
- Post-process leaves the `${TRANSCODE_PATH}/<name>/` directory empty (deleted) regardless of success or failure.

## 11. Related Specifications / Further Reading

- ../../../docs/architecture/feature_registration.spec.md
- ../../providers/http/http.spec.md
- ../../providers/scheduler/scheduler.spec.md
- ../../providers/telegram/telegram.spec.md
