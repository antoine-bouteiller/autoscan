import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { FfmpegClient } from '@/integrations/ffmpeg/client'
import type { PlexClient } from '@/integrations/plex/client'
import type { RadarrClient } from '@/integrations/radarr/client'
import type { SonarrClient } from '@/integrations/sonarr/client'

import { logger } from '@/config/logger'
import { container, TOKENS } from '@/core/bootstrap'
import { logError } from '@/utils/error_handler'

export const cleanUp = async (id: number, file: string, mediaTitle: string): Promise<void> => {
  const paths = file.split('/')

  paths.pop()

  const transcodePath = `${paths.join('/')}/transcode/${id}`

  if (!existsSync(transcodePath)) {
    return
  }

  const files = readdirSync(transcodePath)

  const videoFile = files.find((file) => file.endsWith('.mp4'))

  if (!videoFile) {
    logger.error(`No mp4 video file found`, 'postTranscode', mediaTitle)
    rmSync(transcodePath, { recursive: true })
    return
  }

  const ffmpegClient = container.resolve<FfmpegClient>(TOKENS.FFMPEG_CLIENT)
  const streams = await ffmpegClient.ffprobe(join(transcodePath, videoFile))

  const videoStreams = streams.filter((stream) => stream.codec_type === 'video')
  const audioStreams = streams.filter((stream) => stream.codec_type === 'audio')

  if (videoStreams.length === 0 || audioStreams.length === 0) {
    logger.error(`No audio or video stream found on transcoded file`, 'postTranscode', mediaTitle)
  } else {
    rmSync(file)
    for (const file of files) {
      copyFileSync(join(transcodePath, file), `${paths.join('/')}/${file}`)
    }
  }

  rmSync(transcodePath, { recursive: true })
}

export const handlePostTranscode = async ({
  filePath,
  id,
  mediaTitle,
  mediaType,
}: {
  filePath: string
  id: number
  mediaTitle: string
  mediaType: 'movie' | 'show'
}): Promise<void> => {
  try {
    await cleanUp(id, filePath, mediaTitle)

    const plexClient = container.resolve<PlexClient>(TOKENS.PLEX_CLIENT)
    const sections = await plexClient.getSections()
    const fileDirectory = resolve(filePath, '..')

    if (mediaType === 'movie') {
      const radarrClient = container.resolve<RadarrClient>(TOKENS.RADARR_CLIENT)
      const movieId = await radarrClient.getMovieByPath(filePath)

      if (!movieId) {
        logger.warn(`Could not find movie in Radarr for path: ${filePath}`, 'postTranscode', mediaTitle)
        return
      }

      await radarrClient.refreshMovie(movieId)
      await radarrClient.renameMovie(movieId)
    } else {
      const sonarrClient = container.resolve<SonarrClient>(TOKENS.SONARR_CLIENT)
      const seriesId = await sonarrClient.getSeriesByPath(filePath)

      if (!seriesId) {
        logger.warn(`Could not find series in Sonarr for path: ${filePath}`, 'postTranscode', mediaTitle)
        return
      }

      await sonarrClient.refreshSeries(seriesId)
      await sonarrClient.renameSeries(seriesId)
    }

    await Promise.all(
      (sections ?? []).filter((section) => section.type === mediaType).map((section) => plexClient.refreshSection(section.key, fileDirectory))
    )
  } catch (error) {
    logError(error, 'postTranscode', mediaTitle)
  }
}
