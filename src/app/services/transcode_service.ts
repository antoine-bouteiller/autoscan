import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import type { FFprobeStream } from '@/app/validators/ffprobe_validator'
import type { iso2 } from '@/types/iso_codes'

import { executeFfmpeg, ffprobe } from '@/app/services/ffmpeg_service'
import { logger } from '@/config/logger'

type Criteria =
  | {
      exclude?: string[]
      language: iso2
      wantedEncodings?: string[]
    }
  | {
      language: 'und'
      wantedEncodings?: string[]
    }

const wantedAudioEncodings = ['aac', 'ac3', 'eac3']
const wantedSubtitleEncodings = ['subrip', 'ass']

export class TranscodeService {
  command: string[] = ['-c copy']

  declare subtitleStreams: FFprobeStream[]
  declare videoStreams: FFprobeStream[]
  private audioStreams: FFprobeStream[] = []

  private extension: string | undefined
  private fileName: string | undefined

  private shouldExecute = false

  constructor(
    private file: string,
    private mediaTitle: string,
    private originalLanguage: iso2
  ) {}

  cleanAudio() {
    const criterias: Criteria[][] = [
      [
        { language: this.originalLanguage, wantedEncodings: wantedAudioEncodings },
        { language: 'und', wantedEncodings: wantedAudioEncodings },
        { language: this.originalLanguage },
        { language: 'und' },
      ],
    ]

    if (this.originalLanguage !== 'eng' && this.originalLanguage !== 'fre') {
      criterias.push([
        { language: 'eng', wantedEncodings: wantedAudioEncodings },
        { language: 'eng' },
      ])
    }

    if (this.originalLanguage !== 'fre') {
      criterias.push([
        { language: 'fre', wantedEncodings: wantedAudioEncodings },
        { language: 'fre' },
      ])
    }

    let countAudioStreamToKeep = 0

    for (const languageCriteria of criterias) {
      let audioStreamToKeep = -1
      for (const condition of languageCriteria) {
        audioStreamToKeep = this.audioStreams.findIndex(isStreamWanted(condition))
        if (audioStreamToKeep !== -1) {
          break
        }
      }

      if (audioStreamToKeep >= 0) {
        const stream = this.audioStreams[audioStreamToKeep]
        this.command.push(`-map 0:a:${audioStreamToKeep}`)
        countAudioStreamToKeep++

        const codec = stream?.codec_name?.toLowerCase()

        if (!codec || !wantedAudioEncodings.includes(codec)) {
          this.command.push(`-c:a:${audioStreamToKeep} aac`)

          this.shouldExecute = true

          logger.warn(
            `[${this.mediaTitle}] ${languageCriteria[0]?.language} audio stream 0:a:${audioStreamToKeep} is ${codec}, converting to aac.`
          )
        }

        if (stream?.tags?.language === undefined || stream.tags.language.toLowerCase() === 'und') {
          this.command.push(`-metadata:s:a:${audioStreamToKeep} language=${this.originalLanguage}`)
          this.shouldExecute = true
        }
      }
    }

    if (this.audioStreams.length === 0) {
      throw new Error(
        `[${this.mediaTitle}] No audio streams found for language ${this.originalLanguage}`
      )
    }

    if (countAudioStreamToKeep !== this.audioStreams.length) {
      this.shouldExecute = true
    }

    return
  }

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

  cleanVideo() {
    if (this.videoStreams.length === 0) {
      return
    }

    let countVideoStreamToKeep = 0

    for (const [index, stream] of this.videoStreams.entries()) {
      if (
        stream.codec_name?.toLowerCase() === 'mjpeg' ||
        stream.codec_name?.toLowerCase() === 'png' ||
        stream.codec_name?.toLowerCase() === 'gif'
      ) {
        logger.warn(
          `[${this.mediaTitle}] Video stream 0:v:${index} is ${stream.codec_name.toLowerCase()} removing.`
        )
      } else {
        this.command.push(`-map 0:v:${index}`)
        countVideoStreamToKeep++
      }
    }

    if (this.videoStreams.length === 0) {
      throw new Error(`[${this.mediaTitle}] No video streams found`)
    }

    if (countVideoStreamToKeep !== this.videoStreams.length) {
      this.shouldExecute = true
    }
  }

  async extractSubtitles() {
    const criterias: Criteria[] = [
      { exclude: ['forced', 'sdh'], language: 'eng', wantedEncodings: wantedSubtitleEncodings },
      { exclude: ['forced'], language: 'eng', wantedEncodings: wantedSubtitleEncodings },
      { language: 'und', wantedEncodings: wantedSubtitleEncodings },
    ]

    if (this.originalLanguage === 'fre' || this.subtitleStreams.length === 0) {
      return
    }

    if (this.subtitleStreams.length > 0) {
      this.shouldExecute = true
    }

    let subtitleStreamToKeep = -1
    for (const condition of criterias) {
      subtitleStreamToKeep = this.subtitleStreams.findIndex(isStreamWanted(condition))
      if (subtitleStreamToKeep !== -1) {
        break
      }
    }

    if (subtitleStreamToKeep === -1) {
      return
    }

    const stream = this.subtitleStreams[subtitleStreamToKeep]

    const language = stream?.tags?.language?.toLowerCase() ?? 'eng'

    logger.info(`[${this.mediaTitle}] Extracting subtitles`)

    await executeFfmpeg(this.file, `${this.fileName}.${language}.srt`, [
      `-map 0:s:${subtitleStreamToKeep}`,
      `-c:s:${subtitleStreamToKeep} srt`,
    ])

    this.shouldExecute = true

    logger.info(`[${this.mediaTitle}] Subtitle extracted`)
  }

  async init() {
    const streams = await ffprobe(this.file)

    this.videoStreams = streams.filter((stream) => stream.codec_type === 'video')
    this.audioStreams = streams.filter((stream) => stream.codec_type === 'audio')
    this.subtitleStreams = streams.filter((stream) => stream.codec_type === 'subtitle')

    this.fileName = this.file.slice(0, this.file.lastIndexOf('.')).split('/').pop()
    this.extension = this.file.split('.').pop()
  }

  async transcodeFile() {
    await this.init()

    this.cleanVideo()
    this.cleanAudio()
    await this.extractSubtitles()

    if (this.extension !== 'mp4') {
      this.shouldExecute = true
    }

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

const isStreamWanted = (criteria: Criteria) => (stream: FFprobeStream) => {
  if (criteria.language === 'und') {
    return stream.tags?.language === undefined || stream.tags.language.toLowerCase() === 'und'
  }
  return (
    stream.tags?.language?.toLowerCase() === criteria.language &&
    (!criteria.exclude?.length ||
      !criteria.exclude.some((term) => stream.tags?.title?.toLowerCase().includes(term))) &&
    (!criteria.wantedEncodings?.length ||
      (stream.codec_name && criteria.wantedEncodings.includes(stream.codec_name.toLowerCase())))
  )
}
