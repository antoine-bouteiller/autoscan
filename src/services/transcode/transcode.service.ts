import { Effect, Option, Queue, Ref } from 'effect'

import type { ISOCode1 } from '@/types/iso_codes'
import type { TranscodeJob } from '@/types/transcode'

import { FileNameInvalidError } from '@/errors'
import { RadarrClient } from '@/integrations/arr/radarr.service'
import { SonarrClient } from '@/integrations/arr/sonarr.service'
import { FfmpegClient } from '@/integrations/ffmpeg.service'
import { PlexClient } from '@/integrations/plex.service'

import { processAudioStreams } from './helpers/audio'
import { handlePostTranscode } from './helpers/post_process'
import { processSubtitleStreams } from './helpers/subtitle'
import { simpleHash } from './helpers/utils'
import { processVideoStreams } from './helpers/video'

export class TranscodeService extends Effect.Service<TranscodeService>()('TranscodeService', {
  accessors: true,
  dependencies: [FfmpegClient.Default, PlexClient.Default, RadarrClient.Default, SonarrClient.Default],
  effect: Effect.gen(function* () {
    const ffmpegClient = yield* FfmpegClient
    const plexClient = yield* PlexClient
    const radarrClient = yield* RadarrClient
    const sonarrClient = yield* SonarrClient
    const services = { ffmpegClient, plexClient, radarrClient, sonarrClient }

    const queue = yield* Queue.unbounded<TranscodeJob>()
    const isProcessing = yield* Ref.make(false)

    const processJobEffect = Effect.fn('TranscodeService.processJob')(function* (job: TranscodeJob) {
      yield* Effect.logInfo(`Processing job with command "${job.command.join(' ')}"`).pipe(
        Effect.annotateLogs({ context: 'Transcode', media: job.mediaTitle })
      )

      const fileName = job.file.slice(0, job.file.lastIndexOf('.')).split('/').pop()
      if (!fileName) {
        return yield* new FileNameInvalidError({ mediaTitle: job.mediaTitle, message: `(${job.mediaTitle}) File name not initialized` })
      }

      for (const subtitle of job.subtitlesToExtract) {
        yield* Effect.logInfo(`Extracting subtitle in ${subtitle.language}`).pipe(
          Effect.annotateLogs({ context: 'Transcode', media: job.mediaTitle })
        )

        yield* ffmpegClient.executeFfmpeg(job.id, job.file, `${fileName}.${subtitle.language}.srt`, [
          `-map`,
          `0:s:${subtitle.index}`,
          `-c:s:${subtitle.index}`,
          `srt`,
        ])
      }

      const newFileName = `${fileName}.mp4`
      yield* Effect.logInfo(`Executing transcode`).pipe(Effect.annotateLogs({ context: 'Transcode', media: job.mediaTitle }))
      yield* ffmpegClient.executeFfmpeg(job.id, job.file, newFileName, job.command)
      yield* Effect.logInfo(`Transcoded successfully`).pipe(Effect.annotateLogs({ context: 'Transcode', media: job.mediaTitle }))

      yield* handlePostTranscode(
        {
          filePath: job.file,
          id: job.id,
          mediaTitle: job.mediaTitle,
          mediaType: job.mediaType,
        },
        services
      )
    })

    const processJob = (job: TranscodeJob) =>
      processJobEffect(job).pipe(Effect.catchAll((error) => Effect.logError(String(error)).pipe(Effect.annotateLogs({ context: 'Queue' }))))

    const getTranscodeCommandEffect = Effect.fn('TranscodeService.getTranscodeCommand')(function* (
      file: string,
      mediaTitle: string,
      originalLanguage: ISOCode1
    ) {
      const streams = yield* ffmpegClient.ffprobe(file)

      const videoStreams = streams.filter((stream) => stream.codec_type === 'video')
      const audioStreams = streams.filter((stream) => stream.codec_type === 'audio')
      const subtitleStreams = streams.filter((stream) => stream.codec_type === 'subtitle')

      const extension = file.split('.').pop()
      const fileName = file.slice(0, file.lastIndexOf('.')).split('/').pop()

      if (!fileName) {
        return yield* new FileNameInvalidError({ mediaTitle, message: `(${mediaTitle}) File name not initialized` })
      }

      const command: string[] = ['-c', 'copy']
      let shouldExecute = false

      const videoResult = yield* processVideoStreams([...videoStreams], mediaTitle)
      command.push(...videoResult.command)
      if (videoResult.shouldExecute) {
        shouldExecute = true
      }

      const audioResult = yield* processAudioStreams([...audioStreams], originalLanguage, mediaTitle)
      command.push(...audioResult.command)
      if (audioResult.shouldExecute) {
        shouldExecute = true
      }

      const subtitlesToExtract = processSubtitleStreams([...subtitleStreams], originalLanguage, mediaTitle)
      if (subtitlesToExtract.length > 0) {
        shouldExecute = true
      }

      if (extension !== 'mp4') {
        shouldExecute = true
      }

      if (shouldExecute) {
        return { command, subtitlesToExtract }
      }
      return undefined
    })

    const pollJob = Effect.fn('TranscodeService.pollJob')(function* () {
      return yield* Queue.poll(queue).pipe(
        Effect.map((opt) =>
          Option.match(opt, {
            onNone: () => undefined,
            onSome: (value) => value,
          })
        )
      )
    })

    const processQueue = Effect.fn('TranscodeService.processQueue')(function* () {
      const processing = yield* Ref.get(isProcessing)
      if (processing) {
        return
      }

      yield* Ref.set(isProcessing, true)

      let job = yield* pollJob()

      while (job) {
        yield* processJob(job)
        job = yield* pollJob()
      }

      yield* Ref.set(isProcessing, false)
    })

    const transcodeFile = Effect.fn('TranscodeService.transcodeFile')(function* (
      file: string,
      mediaTitle: string,
      originalLanguage: ISOCode1,
      mediaType: 'movie' | 'show'
    ) {
      const result = yield* getTranscodeCommandEffect(file, mediaTitle, originalLanguage).pipe(
        Effect.catchAllCause((cause) => Effect.logError(String(cause)).pipe(Effect.as(undefined)))
      )
      if (!result) {
        return false
      }

      const id = simpleHash(file)
      const job: TranscodeJob = {
        file,
        id,
        mediaTitle,
        mediaType,
        originalLanguage,
        ...result,
      }

      yield* Queue.offer(queue, job).pipe(
        Effect.tap(() => Effect.logInfo(`Added job to queue`).pipe(Effect.annotateLogs({ context: 'Transcode', media: mediaTitle }))),
        Effect.tap(() => Effect.forkDaemon(processQueue()))
      )

      return true
    })

    const getStatus = Effect.fn('TranscodeService.getStatus')(function* () {
      return yield* Effect.all({
        isProcessing: Ref.get(isProcessing),
        queueLength: Queue.size(queue),
      })
    })

    return {
      getStatus,
      transcodeFile,
    }
  }),
}) {}
