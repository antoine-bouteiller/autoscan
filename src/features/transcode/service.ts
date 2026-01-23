import type { ISOCode1 } from '@/types/iso_codes'

import { logger } from '@/config/logger'
import { executeFfmpeg, ffprobe } from '@/integrations/ffmpeg/client'
import { logError, tryCatch } from '@/utils/error_handler'

import { FileNameInvalidError } from './errors'
import { processAudioStreams } from './helpers/audio'
import { handlePostTranscode } from './helpers/post_process'
import { processSubtitleStreams } from './helpers/subtitle'
import { simpleHash } from './helpers/utils'
import { processVideoStreams } from './helpers/video'

// Types
export interface TranscodeJob {
  command: string[]
  file: string
  id: number
  mediaTitle: string
  mediaType: 'movie' | 'show'
  originalLanguage: ISOCode1
  subtitlesToExtract: { index: number; language: ISOCode1 }[]
}

// Queue Management
class TranscodeQueue {
  private currentJob?: TranscodeJob
  private isProcessing = false
  private readonly queue: TranscodeJob[] = []

  enqueue(job: TranscodeJob): void {
    if (this.queue.some((j) => j.id === job.id)) {
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

      try {
        logger.info(`Processing job with command "${job.command.join(' ')}" (${this.queue.length} jobs remaining)`, 'Transcode', job.mediaTitle)

        const fileName = job.file.slice(0, job.file.lastIndexOf('.')).split('/').pop()
        if (!fileName) {
          throw new FileNameInvalidError(job.mediaTitle)
        }

        for (const subtitle of job.subtitlesToExtract) {
          logger.info(`Extracting subtitle in ${subtitle.language}`, 'Transcode', job.mediaTitle)

          await executeFfmpeg(job.id, job.file, `${fileName}.${subtitle.language}.srt`, [
            `-map`,
            `0:s:${subtitle.index}`,
            `-c:s:${subtitle.index}`,
            `srt`,
          ])
        }

        const newFileName = `${fileName}.mp4`
        logger.info(`Executing transcode`, 'Transcode', job.mediaTitle)
        await executeFfmpeg(job.id, job.file, newFileName, job.command)
        logger.info(`Transcoded successfully`, 'Transcode', job.mediaTitle)

        await handlePostTranscode({
          filePath: job.file,
          id: job.id,
          mediaTitle: job.mediaTitle,
          mediaType: job.mediaType,
        })
      } catch (error) {
        logError(error, 'Queue')
      } finally {
        this.currentJob = undefined
      }
    }

    this.isProcessing = false
  }
}

export const transcodeQueue = new TranscodeQueue()

// Command Builder
export const getTranscodeCommand = async (file: string, mediaTitle: string, originalLanguage: ISOCode1) => {
  const streams = await ffprobe(file)

  const videoStreams = streams.filter((stream) => stream.codec_type === 'video')
  const audioStreams = streams.filter((stream) => stream.codec_type === 'audio')
  const subtitleStreams = streams.filter((stream) => stream.codec_type === 'subtitle')

  const extension = file.split('.').pop()
  const fileName = file.slice(0, file.lastIndexOf('.')).split('/').pop()

  if (!fileName) {
    throw new FileNameInvalidError(mediaTitle)
  }

  const command: string[] = ['-c', 'copy']
  let shouldExecute = false

  const videoResult = processVideoStreams(videoStreams, mediaTitle)
  command.push(...videoResult.command)
  if (videoResult.shouldExecute) {
    shouldExecute = true
  }

  const audioResult = processAudioStreams(audioStreams, originalLanguage, mediaTitle)
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
    return { command, subtitlesToExtract: subtitlesToExtract }
  }
}

// Main Export
export const transcodeFile = async (file: string, mediaTitle: string, originalLanguage: ISOCode1, mediaType: 'movie' | 'show') => {
  const transcodeComands = await tryCatch(getTranscodeCommand, file, mediaTitle, originalLanguage)

  if (transcodeComands) {
    const id = simpleHash(file)
    transcodeQueue.enqueue({
      file,
      id,
      mediaTitle,
      mediaType,
      originalLanguage,
      ...transcodeComands,
    })
    return true
  }
  return false
}
