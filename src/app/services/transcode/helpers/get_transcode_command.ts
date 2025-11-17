import type { iso2 } from '@/types/iso_codes'

import { ffprobe } from '@/app/integrations/ffmpeg/ffmpeg_client'
import { processAudioStreams } from '@/app/services/transcode/helpers/audio_processor'
import { processSubtitleStreams } from '@/app/services/transcode/helpers/subtitle_processor'
import { processVideoStreams } from '@/app/services/transcode/helpers/video_processor'

export const getTranscodeCommand = async (
  file: string,
  mediaTitle: string,
  originalLanguage: iso2
): Promise<string[] | undefined> => {
  const streams = await ffprobe(file)

  const videoStreams = streams.filter((stream) => stream.codec_type === 'video')
  const audioStreams = streams.filter((stream) => stream.codec_type === 'audio')
  const subtitleStreams = streams.filter((stream) => stream.codec_type === 'subtitle')

  const extension = file.split('.').pop()
  const fileName = file.slice(0, file.lastIndexOf('.')).split('/').pop()

  if (!fileName) {
    throw new Error(`[${mediaTitle}] File name not initialized`)
  }

  const command: string[] = ['-c copy']
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

  const subtitleResult = await processSubtitleStreams(
    file,
    fileName,
    subtitleStreams,
    originalLanguage,
    mediaTitle
  )
  if (subtitleResult) {
    shouldExecute = true
  }

  if (extension !== 'mp4') {
    shouldExecute = true
  }

  if (shouldExecute) {
    return command
  }
}
