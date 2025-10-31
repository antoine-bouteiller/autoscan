import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import type { iso2 } from '@/types/iso_codes'

import { AudioProcessor } from '@/app/services/transcode/audio_processor'
import { executeFfmpeg, ffprobe } from '@/app/services/transcode/ffmpeg_service'
import { SubtitleProcessor } from '@/app/services/transcode/subtitle_processor'
import { VideoProcessor } from '@/app/services/transcode/video_processor'
import { logger } from '@/config/logger'

export class TranscodeOrchestrator {
  private command: string[] = ['-c copy']
  private shouldExecute = false
  private extension: string | undefined
  private fileName: string | undefined

  constructor(
    private file: string,
    private mediaTitle: string,
    private originalLanguage: iso2
  ) {}

  async cleanUp() {
    const paths = this.file.split('/')

    paths.pop()

    const transcodePath = `${paths.join('/')}/transcode`

    if (!existsSync(transcodePath)) {
      return
    }

    const files = readdirSync(transcodePath)

    const videoFile = files.find((file) => file.endsWith('.mp4'))

    if (!videoFile) {
      logger.error(`[${this.mediaTitle}] No mp4 video file found`)
      rmSync(transcodePath, { recursive: true })
      return
    }

    const streams = await ffprobe(join(transcodePath, videoFile))

    const videoStreams = streams.filter((stream) => stream.codec_type === 'video')
    const audioStreams = streams.filter((stream) => stream.codec_type === 'audio')

    if (videoStreams.length === 0 || audioStreams.length === 0) {
      logger.error(`[${this.mediaTitle}] No audio or video stream found on transcoded file`)
    } else {
      rmSync(this.file)
      for (const file of files) {
        copyFileSync(join(transcodePath, file), `${paths.join('/')}/${file}`)
      }
    }

    rmSync(transcodePath, { recursive: true })
  }

  async transcodeFile() {
    // Initialize streams
    const streams = await ffprobe(this.file)

    const videoStreams = streams.filter((stream) => stream.codec_type === 'video')
    const audioStreams = streams.filter((stream) => stream.codec_type === 'audio')
    const subtitleStreams = streams.filter((stream) => stream.codec_type === 'subtitle')

    this.fileName = this.file.slice(0, this.file.lastIndexOf('.')).split('/').pop()
    this.extension = this.file.split('.').pop()

    // Process video
    const videoProcessor = new VideoProcessor(videoStreams, this.mediaTitle)
    const videoResult = videoProcessor.process()
    this.command.push(...videoResult.command)
    if (videoResult.shouldExecute) {
      this.shouldExecute = true
    }

    // Process audio
    const audioProcessor = new AudioProcessor(audioStreams, this.originalLanguage, this.mediaTitle)
    const audioResult = audioProcessor.process()
    this.command.push(...audioResult.command)
    if (audioResult.shouldExecute) {
      this.shouldExecute = true
    }

    // Process subtitles
    if (!this.fileName) {
      throw new Error(`[${this.mediaTitle}] File name not initialized`)
    }

    const subtitleProcessor = new SubtitleProcessor(
      this.file,
      this.fileName,
      subtitleStreams,
      this.originalLanguage,
      this.mediaTitle
    )
    const subtitleResult = await subtitleProcessor.process()
    if (subtitleResult) {
      this.shouldExecute = true
    }

    // Check extension
    if (this.extension !== 'mp4') {
      this.shouldExecute = true
    }

    // Execute transcode if needed
    if (this.shouldExecute) {
      const newFileName = `${this.fileName}.mp4`
      logger.info(`[${this.mediaTitle}] Transcoding with command: ${this.command.join(' ')}`)
      await executeFfmpeg(this.file, newFileName, this.command)
      logger.info(`[${this.mediaTitle}] Transcoded`)
      await this.cleanUp()
    }

    return this.shouldExecute
  }
}
