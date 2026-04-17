---
title: Transcoding pipeline
status: condensed
author: Antoine Bouteiller
date: 2026-04-16
related: [docs/specs/architecture.spec.md, src/providers/http/http.spec.md, src/features/language_sync/language_sync.spec.md]
---

## 2. Problem Statement

Plex plays best when files are MP4 with AAC/AC3/EAC3 audio and plain SRT subtitle sidecars. Incoming files from
Radarr/Sonarr arrive in many containers, codecs, and language configurations. Autoscan probes every new file,
decides whether it needs a transmux/transcode, runs FFmpeg, replaces the source with the output, extracts subtitle
tracks into sidecar SRT files, and asks Radarr/Sonarr to re-index.

- `[G-1]` Produce a single MP4 per media with audio in the original language + English + French (when available),
  all in an Plex-friendly codec.
- `[G-2]` Extract embedded subtitles into language-tagged SRT sidecars and tag forced subtitles with `.forced.srt`.
- `[G-3]` Only run FFmpeg when something actually needs to change (container, codec, stream selection, metadata).
- `[G-4]` Serialize transcode work through one in-memory queue — FFmpeg is CPU-bound and concurrent runs thrash.
- `[G-5]` Refresh Plex after the file is replaced so the library picks up the new MP4 immediately.

## 3. Key Design Decisions

| Decision                           | Choice                                                                                                              | Rationale                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `[KD-1]` Trigger                   | Two paths: Radarr/Sonarr `Download` webhook (reactive) + `Transcode` cron every 12h (sweep)                         | Catches both new downloads and any media that was added out-of-band                            |
| `[KD-2]` Probe                     | `ffprobe -print_format json`                                                                                        | One call yields streams + duration needed for forced-subtitle detection                        |
| `[KD-3]` Stream selection          | Prioritized criteria list per language (original > und > en > fr), preferring wanted codecs (aac/ac3/eac3)          | Keeps audio in all languages the user can consume; falls back gracefully when tags are missing |
| `[KD-4]` Forced-subtitle detection | Heuristic on the extracted SRT: lines-per-minute < 3 OR total screen-time ratio < 15%                               | Avoids re-naming full subtitle tracks as `.forced`                                             |
| `[KD-5]` Output staging            | Transcode to `TRANSCODE_PATH/<fileName>/`, verify streams, then copy back beside the original and delete the source | Atomic-ish replacement — failures leave source untouched                                       |
| `[KD-6]` Post-transcode re-index   | Call Radarr `RefreshMovie` + `RenameMovie` (or Sonarr equivalents) then `plex.refreshSections`                      | Radarr/Sonarr detect the new mp4 path; Plex picks up the rename                                |
| `[KD-7]` Queue                     | Plain array + `isProcessing` flag inside a module-level `TranscodeQueue` singleton                                  | No persistence — queue is best-effort; restart = fresh sweep                                   |
| `[KD-8]` Scan re-entry guard       | Module-level `isScanning` boolean in `transcode.job.ts`                                                             | Cron can't overlap itself; Telegram `/transcode` also respects it                              |

## 4. Principles & Intents

- `[PI-1]` **Never transcode unnecessarily** — `shouldExecute` is only set when the output would actually differ
  from the input.
- `[PI-2]` **All FFmpeg invocations go through `FfmpegClient`** — never shell out directly from a service.
- `[PI-3]` **Subtitle extraction precedes transcode** — extracted SRT content is needed by the forced-subtitle
  heuristic, which runs before the main FFmpeg command.
- `[PI-4]` **The original file is only deleted after verifying the output has both audio and video streams**
  (see `post_process.ts:47`).
- `[PI-5]` **Integrations return `T | Error`** — transcode helpers propagate errors via `isError(result) → return result`.

## 5. Non-Goals

- `[NG-1]` Not a quality re-encoder — video is `-c copy` unless the container changes. We don't re-encode video codecs
  for quality/size. mjpeg/png/gif "video" streams are dropped.
- `[NG-2]` No hardware acceleration selection — FFmpeg defaults apply.
- `[NG-3]` No concurrent transcodes — queue is single-consumer.
- `[NG-4]` No persistence of queue state across restarts — deliberate ([KD-7]).
- `[NG-5]` No retries on FFmpeg failure — job is dropped, next cron pass will retry.

## 6. Caveats

- `[C-1]` The queue detects duplicates by exact `file` match but still enqueues them (just logs a warning) —
  `transcode.service.ts:23-27`.
- `[C-2]` FFmpeg child process is not killed on `SIGINT` — it's orphaned and keeps running.
- `[C-3]` Forced-subtitle heuristic thresholds (`3 LPM`, `15% screen-time`) are hand-tuned; edge-case content may be
  mis-tagged. Re-running doesn't un-tag.
- `[C-4]` The output `fileName` is derived by splitting on `/` and `.` — paths containing dots in directory names can
  misbehave.
- `[C-5]` Radarr/Sonarr rename failures are swallowed — only logged, not returned.

## 7. High-Level Components

| Component              | Module type                                                          | Responsibility                                                  | Public API surface                                                                                           |
| ---------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| TranscodeQueue         | Singleton (module scope)                                             | Enqueue / serialize / run FFmpeg + post-process                 | `transcodeQueue.enqueue(job)`, `transcodeQueue.getStatus()`                                                  |
| Transcode service      | Module (`src/features/transcoding/services/transcode.service.ts`)    | Probe + stream decisions + enqueue                              | `transcodeFile({ file, mediaTitle, mediaType, originalLanguage })`                                           |
| Audio helper           | Module (`src/features/transcoding/services/helpers/audio.ts`)        | Pick/retag audio streams per language priority                  | `processAudioStreams(streams, originalLanguage, mediaTitle)`                                                 |
| Video helper           | Module (`src/features/transcoding/services/helpers/video.ts`)        | Drop bogus video streams (mjpeg/png/gif)                        | `processVideoStreams(streams, mediaTitle)`                                                                   |
| Subtitle helper        | Module (`src/features/transcoding/services/helpers/subtitle.ts`)     | Select subtitle streams + forced-subtitle detection             | `processSubtitleStreams(streams, originalLanguage, mediaTitle)`, `isForcedSubtitle(path, duration)`          |
| Post-process helper    | Module (`src/features/transcoding/services/helpers/post_process.ts`) | Move output back in place + Radarr/Sonarr rename + Plex refresh | `handlePostTranscode({ filePath, mediaTitle, mediaType })`                                                   |
| Ffmpeg integration     | Class (`src/integrations/ffmpeg/ffmpeg.service.ts`)                  | `ffmpeg` and `ffprobe` child-process wrappers                   | `FfmpegClient.executeFfmpeg({ folderName, input, output, command })`, `.ffprobe(input)`, `.execute(...args)` |
| Transcode job          | Module (`src/features/transcoding/jobs/transcode.job.ts`)            | Cron entry — iterate all Plex sections + all media              | `runTranscodeProcess()`, `getTranscodingStatus()`                                                            |
| Radarr/Sonarr webhooks | Handlers (`src/features/transcoding/{radarr,sonarr}.webhook.ts`)     | Per-download trigger path                                       | `radarrWebhook`, `sonarrWebhook` (registered in `register.ts`)                                               |
| Feature register       | Module (`src/features/transcoding/register.ts`)                      | Wires HTTP routes, cron, telegram commands for this feature     | `registerTranscoding()`                                                                                      |

## 8. Detailed Design

> Condensed after implementation. See source code for full detail.

| Component             | Module                                      | Entry point                                                                                            |
| --------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| TranscodeQueue        | `src/features/transcoding/services`         | `src/features/transcoding/services/transcode.service.ts` (`transcodeQueue`)                            |
| Transcode service     | `src/features/transcoding/services`         | `src/features/transcoding/services/transcode.service.ts` (`transcodeFile`)                             |
| Audio helper          | `src/features/transcoding/services/helpers` | `src/features/transcoding/services/helpers/audio.ts` (`processAudioStreams`)                           |
| Video helper          | `src/features/transcoding/services/helpers` | `src/features/transcoding/services/helpers/video.ts` (`processVideoStreams`)                           |
| Subtitle helper       | `src/features/transcoding/services/helpers` | `src/features/transcoding/services/helpers/subtitle.ts` (`processSubtitleStreams`, `isForcedSubtitle`) |
| Post-process helper   | `src/features/transcoding/services/helpers` | `src/features/transcoding/services/helpers/post_process.ts` (`handlePostTranscode`)                    |
| Ffmpeg integration    | `src/integrations/ffmpeg`                   | `src/integrations/ffmpeg/ffmpeg.service.ts` (`FfmpegClient`)                                           |
| Transcode job         | `src/features/transcoding/jobs`             | `src/features/transcoding/jobs/transcode.job.ts` (`runTranscodeProcess`, `getTranscodingStatus`)       |
| Radarr webhook        | `src/features/transcoding/webhooks`         | `src/features/transcoding/webhooks/radarr.webhook.ts` (`radarrWebhook`)                                |
| Sonarr webhook        | `src/features/transcoding/webhooks`         | `src/features/transcoding/webhooks/sonarr.webhook.ts` (`sonarrWebhook`)                                |
| Transcode command     | `src/features/transcoding/commands`         | `src/features/transcoding/commands/transcode.command.ts`                                               |
| Subtitle scan command | `src/features/transcoding/commands`         | `src/features/transcoding/commands/subtitle_scan.command.ts`                                           |
| Feature register      | `src/features/transcoding`                  | `src/features/transcoding/register.ts` (`registerTranscoding`)                                         |
| Types & errors        | `src/features/transcoding`                  | `src/features/transcoding/types.ts`, `src/features/transcoding/errors.ts`                              |

## 9. Verification Criteria

- `[VC-1]` `processVideoStreams` drops mjpeg/png/gif; returns error when no video remains — **PASS** (`tests/services/transcode/helpers/video.spec.ts`).
- `[VC-2]` `processAudioStreams` picks original-language audio first, transcodes non-aac/ac3/eac3 to aac — **PASS** (`tests/services/transcode/helpers/audio.spec.ts`).
- `[VC-3]` `processSubtitleStreams` picks English + French subs, respects `forced`/`sdh` exclusion — **PASS** (`tests/services/transcode/helpers/subtitle.spec.ts`).
- `[VC-4]` `isForcedSubtitle` classifies low-LPM / low-screen-time SRTs as forced — **PASS** (`tests/services/transcode/helpers/subtitle.spec.ts`).
- `[VC-5]` `transcodeFile` enqueues when `shouldExecute`, returns `false` on probe error or when no changes needed — **PASS** (`tests/services/transcode/transcode.service.spec.ts`).
- `[VC-6]` `utils.isStreamWanted` filters by language/encoding/include/exclude — **PASS** (`tests/services/transcode/helpers/utils.spec.ts`).
- `[VC-7.1]` `registerTranscoding()` attaches exactly: `POST /radarr`, `POST /sonarr`, cron `Transcode` (12h),
  `/transcode` command, `/subtitlescan` command.

## 10. Open Questions

N/A
