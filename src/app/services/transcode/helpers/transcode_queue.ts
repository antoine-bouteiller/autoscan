import { executeFfmpeg } from '@/app/integrations/ffmpeg/ffmpeg_client'
import { handlePostTranscode } from '@/app/services/transcode/helpers/post_transcode'
import { logger } from '@/config/logger'
import type { iso2 } from '@/types/iso_codes'

export interface TranscodeJob {
  file: string
  mediaTitle: string
  originalLanguage: iso2
  mediaType: 'movie' | 'show'
  command: string[]
}

class TranscodeQueue {
  private readonly queue: TranscodeJob[] = []
  private isProcessing = false
  private currentJob?: TranscodeJob

  enqueue(job: TranscodeJob): void {
    this.queue.push(job)
    logger.info(`[Queue] Added job for "${job.mediaTitle}" (${this.queue.length} jobs in queue)`)

    if (!this.isProcessing) {
      this.processQueue()
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

        const newFileName = `${fileName}.mp4`
        logger.info(`[${job.mediaTitle}] Executing transcode`)
        await executeFfmpeg(job.file, newFileName, job.command)
        logger.info(`[${job.mediaTitle}] Transcoded successfully`)

        await handlePostTranscode(job.file, job.mediaType, job.mediaTitle)
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
}

export const transcodeQueue = new TranscodeQueue()
