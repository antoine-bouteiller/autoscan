import type { ISOCode1 } from '@/types/iso_codes'

import { executeFfmpeg } from '@/app/integrations/ffmpeg/ffmpeg_client'
import { handlePostTranscode } from '@/app/services/transcode/helpers/post_transcode'
import { logger } from '@/config/logger'

export interface TranscodeJob {
  command: string[]
  file: string
  id: number
  mediaTitle: string
  mediaType: 'movie' | 'show'
  originalLanguage: ISOCode1
  subtitlesToExtract: { index: number; language: ISOCode1 }[]
}

class TranscodeQueue {
  private currentJob?: TranscodeJob
  private isProcessing = false
  private readonly queue: TranscodeJob[] = []

  enqueue(job: TranscodeJob): void {
    if (this.queue.some((j) => j.id === job.id)) {
      logger.warn(`${job.mediaTitle} already in queue`)
    }

    this.queue.push(job)
    logger.info(`Added job for ${job.mediaTitle} (${this.queue.length} jobs in queue)`)

    if (!this.isProcessing) {
      this.processQueue()
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
        logger.info(
          `[${job.mediaTitle}] Processing job with command "${job.command}" (${this.queue.length} jobs remaining)`
        )

        const fileName = job.file.slice(0, job.file.lastIndexOf('.')).split('/').pop()
        if (!fileName) {
          throw new Error(`[${job.mediaTitle}] File name not initialized`)
        }

        for (const subtitle of job.subtitlesToExtract) {
          logger.info(`[${job.mediaTitle}] Extracting subtitle in ${subtitle.language}`)

          await executeFfmpeg(job.id, job.file, `${fileName}.${subtitle.language}.srt`, [
            `-map 0:s:${subtitle.index}`,
            `-c:s:${subtitle.index} srt`,
          ])
        }

        const newFileName = `${fileName}.mp4`
        logger.info(`[${job.mediaTitle}] Executing transcode`)
        await executeFfmpeg(job.id, job.file, newFileName, job.command)
        logger.info(`[${job.mediaTitle}] Transcoded successfully`)

        await handlePostTranscode({
          filePath: job.file,
          id: job.id,
          mediaTitle: job.mediaTitle,
          mediaType: job.mediaType,
        })
      } catch (error) {
        logger.error(
          {
            err: error,
            mediaTitle: job.mediaTitle,
          },
          `[Queue] Error processing job for "${job.mediaTitle}"`
        )
      } finally {
        this.currentJob = undefined
      }
    }

    this.isProcessing = false
  }
}

export const transcodeQueue = new TranscodeQueue()
