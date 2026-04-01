import { existsSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'

import env from '#config/env'
import { logger } from '#config/logger'
import { container, TOKENS } from '#core/container'
import { FileNameInvalidError, FileNotFoundError } from '#errors/transcode'
import type { FfmpegClient } from '#integrations/ffmpeg.service'
import type { IPlexClient } from '#integrations/plex.service'
import type { ISOCode1 } from '#types/iso_codes'
import type { TranscodeJob } from '#types/transcode'
import { isError, logError } from '#utils/error'

import { processAudioStreams } from './helpers/audio.js'
import { handlePostTranscode } from './helpers/post_process.js'
import { isForcedSubtitle, processSubtitleStreams } from './helpers/subtitle.js'
import { simpleHash } from './helpers/utils.js'
import { processVideoStreams } from './helpers/video.js'

const refreshPlexSections = async (filePath: string, mediaType: 'movie' | 'show') => {
  const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)
  const sections = await plexClient.getSections()
  const fileDirectory = resolve(filePath, '..')

  logger.info(`File not found, refreshing Plex sections`, 'Transcode')

  await Promise.all(
    (sections ?? []).filter((section) => section.type === mediaType).map((section) => plexClient.refreshSection(section.key, fileDirectory))
  )
}

class TranscodeQueue {
  private currentJob?: TranscodeJob
  private isProcessing = false
  private readonly queue: TranscodeJob[] = []

  enqueue(job: TranscodeJob): void {
    if (this.queue.some((queued) => queued.id === job.id)) {
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

      const ffmpegClient = container.resolve<FfmpegClient>(TOKENS.FFMPEG_CLIENT)

      let subtitleFailed = false
      for (const subtitle of job.subtitlesToExtract) {
        logger.info(`Extracting subtitle in ${subtitle.language}`, 'Transcode', job.mediaTitle)

        const subtitleOutput = `${fileName}.${subtitle.language}.srt`
        const subtitleResult = await ffmpegClient.executeFfmpeg(job.id, job.file, subtitleOutput, [
          `-map`,
          `0:s:${subtitle.index}`,
          `-c:s:${subtitle.index}`,
          `srt`,
        ])

        if (isError(subtitleResult)) {
          logError(subtitleResult, 'Queue')
          subtitleFailed = true
          break
        }

        const subtitlePath = `${env.TRANSCODE_PATH}/${job.id}/${subtitleOutput}`
        if (job.duration && isForcedSubtitle(subtitlePath, job.duration)) {
          const forcedPath = subtitlePath.replace(`.${subtitle.language}.srt`, `.${subtitle.language}.forced.srt`)
          renameSync(subtitlePath, forcedPath)
          logger.info(`Renamed forced subtitle to ${subtitle.language}.forced.srt`, 'Transcode', job.mediaTitle)
        }
      }

      if (subtitleFailed) {
        this.currentJob = undefined
        continue
      }

      const newFileName = `${fileName}.mp4`
      logger.info(`Executing transcode`, 'Transcode', job.mediaTitle)
      const transcodeResult = await ffmpegClient.executeFfmpeg(job.id, job.file, newFileName, job.command)

      if (isError(transcodeResult)) {
        logError(transcodeResult, 'Queue')
        this.currentJob = undefined
        continue
      }

      logger.info(`Transcoded successfully`, 'Transcode', job.mediaTitle)

      await handlePostTranscode({
        filePath: job.file,
        id: job.id,
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
  const ffmpegClient = container.resolve<FfmpegClient>(TOKENS.FFMPEG_CLIENT)
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
    return { command, duration, subtitlesToExtract: subtitlesToExtract }
  }
}

export const transcodeFile = async (file: string, mediaTitle: string, originalLanguage: ISOCode1, mediaType: 'movie' | 'show') => {
  if (!existsSync(file)) {
    const error = new FileNotFoundError({ filePath: file })
    logError(error, 'transcodeFile')
    await refreshPlexSections(file, mediaType)
    return false
  }

  const result = await getTranscodeCommand(file, mediaTitle, originalLanguage)

  if (isError(result)) {
    logError(result, 'transcodeFile')
    return false
  }

  if (result) {
    const id = simpleHash(file)
    transcodeQueue.enqueue({
      file,
      id,
      mediaTitle,
      mediaType,
      originalLanguage,
      ...result,
    })
    return true
  }
  return false
}
