import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import env from '#config/env'
import { logger } from '#config/logger'
import { container, TOKENS } from '#core/container'
import type { IRadarrClient } from '#integrations/arr/radarr.service'
import type { ISonarrClient } from '#integrations/arr/sonarr.service'
import type { FfmpegClient } from '#integrations/ffmpeg.service'
import type { IPlexClient } from '#integrations/plex.service'
import { isError, logError } from '#utils/error'

const cleanUp = async (id: number, inputFile: string, mediaTitle: string): Promise<void> => {
  const transcodePath = `${env.TRANSCODE_PATH}/${id}`

  if (!existsSync(transcodePath)) {
    return
  }

  const outputFiles = readdirSync(transcodePath)

  const videoFile = outputFiles.find((outputFile) => outputFile.endsWith('.mp4'))

  if (!videoFile) {
    logger.error(`No mp4 video file found`, 'postTranscode', mediaTitle)
    rmSync(transcodePath, { recursive: true })
    return
  }

  const ffmpegClient = container.resolve<FfmpegClient>(TOKENS.FFMPEG_CLIENT)
  const streamsResult = await ffmpegClient.ffprobe(join(transcodePath, videoFile))

  if (isError(streamsResult)) {
    logError(streamsResult, 'postTranscode', mediaTitle)
    rmSync(transcodePath, { recursive: true })
    return
  }

  const videoStreams = streamsResult.filter((stream) => stream.codec_type === 'video')
  const audioStreams = streamsResult.filter((stream) => stream.codec_type === 'audio')

  if (videoStreams.length === 0 || audioStreams.length === 0) {
    logger.error(`No audio or video stream found on transcoded file`, 'postTranscode', mediaTitle)
  } else {
    const inputDir = resolve(inputFile, '..')
    rmSync(inputFile)
    for (const outputFile of outputFiles) {
      copyFileSync(join(transcodePath, outputFile), join(inputDir, outputFile))
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
  await cleanUp(id, filePath, mediaTitle)

  const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)
  const sections = await plexClient.getSections()
  const fileDirectory = resolve(filePath, '..')

  if (mediaType === 'movie') {
    const radarrClient = container.resolve<IRadarrClient>(TOKENS.RADARR_CLIENT)
    const movieId = await radarrClient.getMovieByPath(filePath)

    if (!movieId) {
      logger.warn(`Could not find movie in Radarr for path: ${filePath}`, 'postTranscode', mediaTitle)
      return
    }

    await radarrClient.refreshMovie(movieId)
    await radarrClient.renameMovie(movieId)
  } else {
    const sonarrClient = container.resolve<ISonarrClient>(TOKENS.SONARR_CLIENT)
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
}
