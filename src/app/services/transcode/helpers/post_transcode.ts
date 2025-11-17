import { join, resolve } from 'node:path'

import { getMovieByPath, refreshMovie, renameMovie } from '@/app/integrations/arr/radarr_client'
import { getSeriesByPath, refreshSeries, renameSeries } from '@/app/integrations/arr/sonarr_client'
import { ffprobe } from '@/app/integrations/ffmpeg/ffmpeg_client'
import { getSections, refreshSection } from '@/app/integrations/plex/plex_client'
import { logger } from '@/config/logger'
import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs'

export const cleanUp = async (file: string, mediaTitle: string): Promise<void> => {
  const paths = file.split('/')

  paths.pop()

  const transcodePath = `${paths.join('/')}/transcode`

  if (!existsSync(transcodePath)) {
    return
  }

  const files = readdirSync(transcodePath)

  const videoFile = files.find((file) => file.endsWith('.mp4'))

  if (!videoFile) {
    logger.error(`[${mediaTitle}] No mp4 video file found`)
    rmSync(transcodePath, { recursive: true })
    return
  }

  const streams = await ffprobe(join(transcodePath, videoFile))

  const videoStreams = streams.filter((stream) => stream.codec_type === 'video')
  const audioStreams = streams.filter((stream) => stream.codec_type === 'audio')

  if (videoStreams.length === 0 || audioStreams.length === 0) {
    logger.error(`[${mediaTitle}] No audio or video stream found on transcoded file`)
  } else {
    rmSync(file)
    for (const file of files) {
      copyFileSync(join(transcodePath, file), `${paths.join('/')}/${file}`)
    }
  }

  rmSync(transcodePath, { recursive: true })
}

export const handlePostTranscode = async (
  filePath: string,
  mediaType: 'movie' | 'show',
  mediaTitle: string
): Promise<void> => {
  try {
    await cleanUp(filePath, mediaTitle)

    const sections = await getSections()
    const fileDirectory = resolve(filePath, '..')

    await Promise.all(
      sections
        .filter((section) => section.type === mediaType)
        .map((section) => refreshSection(section.key, fileDirectory))
    )

    if (mediaType === 'movie') {
      const movieId = await getMovieByPath(filePath)

      if (!movieId) {
        logger.warn(`[${mediaTitle}] Could not find movie in Radarr for path: ${filePath}`)
        return
      }

      await refreshMovie(movieId)
      await renameMovie(movieId)
    } else {
      const seriesId = await getSeriesByPath(filePath)

      if (!seriesId) {
        logger.warn(`[${mediaTitle}] Could not find series in Sonarr for path: ${filePath}`)
        return
      }

      await refreshSeries(seriesId)
      await renameSeries(seriesId)
    }
  } catch (error) {
    logger.error(
      {
        err: error,
        filePath,
        mediaTitle,
        mediaType,
      },
      `[${mediaTitle}] Error during post-transcode processing`
    )
  }
}
