import { Cause, Effect, FileSystem, Layer, Path, Queue, Schema } from 'effect'

import { Env } from '@/config/env'
import { Ffmpeg, Plex, TranscodeQueue } from '@/core/runtime.service'
import { FileNameInvalidError, FileNotFoundError, ReplacementRollbackError } from '@/features/transcoding/errors'
import { type TranscodeJob } from '@/features/transcoding/types'
import { type ISOCode1 } from '@/shared/types/iso_codes'

import { processAudioStreams } from './helpers/audio.js'
import { handlePostTranscode } from './helpers/post_process.js'
import { isForcedSubtitle, processSubtitleStreams } from './helpers/subtitle.js'
import { processVideoStreams } from './helpers/video.js'

const encodeRecoveryMarker = Schema.encodeSync(Schema.fromJsonString(Schema.Struct({ file: Schema.String, mediaTitle: Schema.String })))

const processJob = (job: TranscodeJob) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const env = yield* Env
    const fileName = path.basename(job.file, job.file.slice(job.file.lastIndexOf('.')))
    if (fileName.length === 0) {
      return yield* new FileNameInvalidError({ mediaTitle: job.mediaTitle })
    }

    const outputDirectory = `${env.TRANSCODE_PATH}/${fileName}`
    const recoveryMarker = path.join(outputDirectory, '.autoscan-recovery.json')
    const cleanup = Effect.ignore(fs.remove(outputDirectory, { recursive: true }))
    if (yield* fs.exists(recoveryMarker)) {
      return yield* new ReplacementRollbackError({
        artifacts: [outputDirectory, recoveryMarker],
        cause: new Error('Unresolved replacement marker'),
      })
    }
    const mediaDirectory = path.dirname(job.file)
    const recoveryArtifacts = (yield* fs.readDirectory(mediaDirectory))
      .filter((name) => name.includes('autoscan-') && (name.startsWith(`${fileName}.`) || name.startsWith(`.${fileName}.`)))
      .map((name) => path.join(mediaDirectory, name))
    if (recoveryArtifacts.length > 0) {
      return yield* new ReplacementRollbackError({
        artifacts: recoveryArtifacts,
        cause: new Error('Unresolved replacement artifacts'),
      })
    }
    const work = Effect.gen(function* () {
      yield* cleanup
      yield* fs.makeDirectory(outputDirectory, { recursive: true })
      yield* fs.writeFileString(recoveryMarker, encodeRecoveryMarker({ file: job.file, mediaTitle: job.mediaTitle }))
      const ffmpeg = yield* Ffmpeg
      for (const subtitle of job.subtitlesToExtract) {
        const subtitleOutput = `${fileName}.${subtitle.language}.srt`
        yield* ffmpeg.executeFfmpeg({
          command: ['-map', `0:s:${subtitle.index}`, `-c:s:${subtitle.index}`, 'srt'],
          folderName: fileName,
          input: job.file,
          output: subtitleOutput,
        })
        const subtitlePath = `${outputDirectory}/${subtitleOutput}`
        if (job.duration !== undefined && (yield* isForcedSubtitle(subtitlePath, job.duration))) {
          yield* fs.rename(subtitlePath, subtitlePath.replace(`.${subtitle.language}.srt`, `.${subtitle.language}.forced.srt`))
        }
      }

      yield* ffmpeg.executeFfmpeg({ command: job.command, folderName: fileName, input: job.file, output: `${fileName}.mp4` })
      yield* handlePostTranscode({ filePath: job.file, mediaTitle: job.mediaTitle, mediaType: job.mediaType })
    })

    return yield* work.pipe(
      Effect.catch((error) =>
        Effect.gen(function* () {
          if (!(error instanceof ReplacementRollbackError)) {
            yield* cleanup
          }
          return yield* error
        })
      ),
      Effect.catchDefect((defect) => cleanup.pipe(Effect.flatMap(() => Effect.die(defect)))),
      Effect.onInterrupt(() => cleanup)
    )
  })

export const TranscodeQueueLive = Layer.effect(
  TranscodeQueue,
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<TranscodeJob>()
    const knownFiles = new Set<string>()
    let accepting = true
    let currentJob: TranscodeJob | undefined
    let isProcessing = false

    const worker = Effect.forever(
      Queue.take(queue).pipe(
        Effect.tap((job) =>
          Effect.gen(function* () {
            currentJob = job
            isProcessing = true
            yield* Effect.logInfo(`Processing job with command "${job.command.join(' ')}"`).pipe(
              Effect.annotateLogs('context', ['Transcode', job.mediaTitle])
            )
          })
        ),
        Effect.flatMap(processJob),
        Effect.catchCauseIf(
          (cause) => !Cause.hasInterruptsOnly(cause),
          (cause) => Effect.logError(cause, 'Transcode Queue')
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (currentJob !== undefined) {
              knownFiles.delete(currentJob.file)
            }
            currentJob = undefined
            isProcessing = false
          })
        )
      )
    )

    yield* Effect.forkScoped(worker)
    yield* Effect.addFinalizer(() => Queue.shutdown(queue))

    const awaitIdle: Effect.Effect<void> = Effect.suspend(() =>
      isProcessing || knownFiles.size > 0 ? Effect.sleep(10).pipe(Effect.flatMap(() => awaitIdle)) : Effect.void
    )

    return TranscodeQueue.of({
      awaitIdle,
      enqueue: (job) =>
        Effect.suspend(() => {
          if (!accepting || knownFiles.has(job.file)) {
            return Effect.succeed(false)
          }
          knownFiles.add(job.file)
          return Effect.logInfo(`Added job (${knownFiles.size} jobs active or queued)`).pipe(
            Effect.annotateLogs('context', ['Transcode', job.mediaTitle]),
            Effect.andThen(Queue.offer(queue, job)),
            Effect.as(true)
          )
        }),
      status: Queue.size(queue).pipe(Effect.map((queueLength) => ({ currentJob, isProcessing, queueLength }))),
      stopIntake: Effect.sync(() => {
        accepting = false
      }),
    })
  })
)

const getTranscodeCommand = (file: string, mediaTitle: string, originalLanguage: ISOCode1) =>
  Effect.gen(function* () {
    const ffmpeg = yield* Ffmpeg
    const probe = yield* ffmpeg.ffprobe(file)
    const video = processVideoStreams(
      probe.streams.filter((stream) => stream.codec_type === 'video'),
      mediaTitle
    )
    if (video instanceof Error) {
      return yield* video
    }
    const audio = processAudioStreams(
      probe.streams.filter((stream) => stream.codec_type === 'audio'),
      originalLanguage,
      mediaTitle
    )
    if (audio instanceof Error) {
      return yield* audio
    }
    const subtitlesToExtract = processSubtitleStreams(
      probe.streams.filter((stream) => stream.codec_type === 'subtitle'),
      originalLanguage,
      mediaTitle
    )
    const extension = file.split('.').pop()
    const shouldExecute = video.shouldExecute || audio.shouldExecute || subtitlesToExtract.length > 0 || extension !== 'mp4'
    return shouldExecute ? { command: ['-c', 'copy', ...video.command, ...audio.command], duration: probe.duration, subtitlesToExtract } : undefined
  })

export const transcodeFile = (params: { file: string; mediaTitle: string; originalLanguage: ISOCode1; mediaType: 'movie' | 'show' }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    if (!(yield* fs.exists(params.file))) {
      const error = new FileNotFoundError({ filePath: params.file })
      yield* Effect.logError(Cause.fail(error), 'transcodeFile')
      const plex = yield* Plex
      yield* plex.refreshSections(params.file, params.mediaType)
      return false
    }

    const result = yield* getTranscodeCommand(params.file, params.mediaTitle, params.originalLanguage).pipe(
      Effect.catchCauseIf(
        (cause) => !Cause.hasInterruptsOnly(cause),
        (cause) => Effect.logError(cause, 'transcodeFile').pipe(Effect.as(undefined))
      )
    )
    if (result === undefined) {
      return false
    }

    const queue = yield* TranscodeQueue
    return yield* queue.enqueue({ ...params, ...result })
  })
