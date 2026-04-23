import env from '#/config/env'
import { logger } from '#/config/logger'
import { container, TOKENS } from '#/core/container'
import { FileNameInvalidError, FileNotFoundError } from '#/features/transcoding/errors'
import { type TranscodeJob } from '#/features/transcoding/types'
import { type ISOCode1 } from '#/shared/types/iso_codes'
import { isError, logError } from '#/shared/utils/error'
import { safeExistsSync, safeRenameSync } from '#/shared/utils/fs'

import { processAudioStreams } from './helpers/audio.js'
import { handlePostTranscode } from './helpers/post_process.js'
import { isForcedSubtitle, processSubtitleStreams } from './helpers/subtitle.js'
import { processVideoStreams } from './helpers/video.js'

class TranscodeQueue {
  private currentJob?: TranscodeJob
  private isProcessing = false
  private readonly queue: TranscodeJob[] = []

  enqueue(job: TranscodeJob): void {
    if (this.queue.some((queued) => queued.file === job.file)) {
      logger.warn(`Media already in queue`, 'Transcode', job.mediaTitle)
    }

    this.queue.push(job)
    logger.info(`Added job (${this.queue.length} jobs in queue)`, 'Transcode', job.mediaTitle)

    if (!this.isProcessing) {
      void this.processQueue()
    }
  }

  getStatus(): {
    currentJob?: TranscodeJob
    isProcessing: boolean
    queueLength: number
  } {
    return {
      currentJob: this.currentJob,
      isProcessing: this.isProcessing,
      queueLength: this.queue.length,
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return
    }

    this.isProcessing = true

    while (this.queue.length > 0) {
      const job = this.queue.shift()

      if (!job) {
        break
      }

      this.currentJob = job

      logger.info(`Processing job with command "${job.command.join(' ')}" (${this.queue.length} jobs remaining)`, 'Transcode', job.mediaTitle)

      const fileName = job.file.slice(0, job.file.lastIndexOf('.')).split('/').pop()
      if (!fileName) {
        logError(new FileNameInvalidError({ mediaTitle: job.mediaTitle }), 'Queue')
        this.currentJob = undefined
        continue
      }

      const ffmpegClient = container.resolve(TOKENS.FFMPEG_CLIENT)

      let subtitleFailed = false
      for (const subtitle of job.subtitlesToExtract) {
        logger.info(`Extracting subtitle in ${subtitle.language}`, 'Transcode', job.mediaTitle)

        const subtitleOutput = `${fileName}.${subtitle.language}.srt`
        const subtitleResult = await ffmpegClient.executeFfmpeg({
          command: [`-map`, `0:s:${subtitle.index}`, `-c:s:${subtitle.index}`, `srt`],
          folderName: fileName,
          input: job.file,
          output: subtitleOutput,
        })

        if (isError(subtitleResult)) {
          logError(subtitleResult, 'Queue')
          subtitleFailed = true
          break
        }

        const subtitlePath = `${env.TRANSCODE_PATH}/${fileName}/${subtitleOutput}`
        if (job.duration && isForcedSubtitle(subtitlePath, job.duration)) {
          const forcedPath = subtitlePath.replace(`.${subtitle.language}.srt`, `.${subtitle.language}.forced.srt`)
          const renameResult = safeRenameSync(subtitlePath, forcedPath)
          if (renameResult instanceof Error) {
            logError(renameResult, 'Queue')
          }
          logger.info(`Renamed forced subtitle to ${subtitle.language}.forced.srt`, 'Transcode', job.mediaTitle)
        }
      }

      if (subtitleFailed) {
        this.currentJob = undefined
        continue
      }

      const newFileName = `${fileName}.mp4`
      logger.info(`Executing transcode`, 'Transcode', job.mediaTitle)
      const transcodeResult = await ffmpegClient.executeFfmpeg({ command: job.command, folderName: fileName, input: job.file, output: newFileName })

      if (isError(transcodeResult)) {
        logError(transcodeResult, 'Queue')
        this.currentJob = undefined
        continue
      }

      logger.info(`Transcoded successfully`, 'Transcode', job.mediaTitle)

      await handlePostTranscode({
        filePath: job.file,
        mediaTitle: job.mediaTitle,
        mediaType: job.mediaType,
      })

      this.currentJob = undefined
    }

    this.isProcessing = false
  }
}

export const transcodeQueue = new TranscodeQueue()

const getTranscodeCommand = async (file: string, mediaTitle: string, originalLanguage: ISOCode1) => {
  const ffmpegClient = container.resolve(TOKENS.FFMPEG_CLIENT)
  const probeResult = await ffmpegClient.ffprobe(file)

  if (isError(probeResult)) {
    return probeResult
  }

  const videoStreams = probeResult.streams.filter((stream) => stream.codec_type === 'video')
  const audioStreams = probeResult.streams.filter((stream) => stream.codec_type === 'audio')
  const subtitleStreams = probeResult.streams.filter((stream) => stream.codec_type === 'subtitle')
  const { duration } = probeResult

  const extension = file.split('.').pop()
  const fileName = file.slice(0, file.lastIndexOf('.')).split('/').pop()

  if (!fileName) {
    return new FileNameInvalidError({ mediaTitle })
  }

  const command: string[] = ['-c', 'copy']
  let shouldExecute = false

  const videoResult = processVideoStreams(videoStreams, mediaTitle)
  if (isError(videoResult)) {
    return videoResult
  }
  command.push(...videoResult.command)
  if (videoResult.shouldExecute) {
    shouldExecute = true
  }

  const audioResult = processAudioStreams(audioStreams, originalLanguage, mediaTitle)
  if (isError(audioResult)) {
    return audioResult
  }
  command.push(...audioResult.command)
  if (audioResult.shouldExecute) {
    shouldExecute = true
  }

  const subtitlesToExtract = await processSubtitleStreams(subtitleStreams, originalLanguage, mediaTitle)
  if (subtitlesToExtract.length > 0) {
    shouldExecute = true
  }

  if (extension !== 'mp4') {
    shouldExecute = true
  }

  if (shouldExecute) {
    return { command, duration, subtitlesToExtract }
  }

  return undefined
}

export const transcodeFile = async (params: { file: string; mediaTitle: string; originalLanguage: ISOCode1; mediaType: 'movie' | 'show' }) => {
  const { file, mediaTitle, originalLanguage, mediaType } = params
  if (!safeExistsSync(file)) {
    const error = new FileNotFoundError({ filePath: file })
    logError(error, 'transcodeFile')
    const plexClient = container.resolve(TOKENS.PLEX_CLIENT)
    await plexClient.refreshSections(file, mediaType)
    return false
  }

  const result = await getTranscodeCommand(file, mediaTitle, originalLanguage)

  if (isError(result)) {
    logError(result, 'transcodeFile')
    return false
  }

  if (result) {
    transcodeQueue.enqueue({
      file,
      mediaTitle,
      mediaType,
      originalLanguage,
      ...result,
    })
    return true
  }
  return false
}
