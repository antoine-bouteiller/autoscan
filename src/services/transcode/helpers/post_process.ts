import { join, resolve } from 'node:path'

import env from '#config/env'
import { logger } from '#config/logger'
import { container, TOKENS } from '#core/container'
import { type IRadarrClient } from '#integrations/arr/radarr.service'
import { type ISonarrClient } from '#integrations/arr/sonarr.service'
import { type FfmpegClient } from '#integrations/ffmpeg.service'
import { type IPlexClient } from '#integrations/plex.service'
import { isError, logError } from '#utils/error'
import { safeCopyFileSync, safeExistsSync, safeReaddirSync, safeRmSync } from '#utils/fs'

const cleanUp = async (inputFile: string, mediaTitle: string): Promise<void> => {
  const fileName = inputFile.slice(0, inputFile.lastIndexOf('.')).split('/').pop()
  const transcodePath = `${env.TRANSCODE_PATH}/${fileName}`

  if (!safeExistsSync(transcodePath)) {
    return
  }

  const outputFiles = safeReaddirSync(transcodePath)
  if (outputFiles instanceof Error) {
    logError(outputFiles, 'postTranscode', mediaTitle)
    return
  }

  const videoFile = outputFiles.find((outputFile) => outputFile.endsWith('.mp4'))

  if (!videoFile) {
    logger.error(`No mp4 video file found`, 'postTranscode', mediaTitle)
    safeRmSync(transcodePath, { recursive: true })
    return
  }

  const ffmpegClient = container.resolve<FfmpegClient>(TOKENS.FFMPEG_CLIENT)
  const probeResult = await ffmpegClient.ffprobe(join(transcodePath, videoFile))

  if (isError(probeResult)) {
    logError(probeResult, 'postTranscode', mediaTitle)
    safeRmSync(transcodePath, { recursive: true })
    return
  }

  const videoStreams = probeResult.streams.filter((stream) => stream.codec_type === 'video')
  const audioStreams = probeResult.streams.filter((stream) => stream.codec_type === 'audio')

  if (videoStreams.length === 0 || audioStreams.length === 0) {
    logger.error(`No audio or video stream found on transcoded file`, 'postTranscode', mediaTitle)
  } else {
    const inputDir = resolve(inputFile, '..')
    safeRmSync(inputFile)
    for (const outputFile of outputFiles) {
      safeCopyFileSync(join(transcodePath, outputFile), join(inputDir, outputFile))
    }
  }

  safeRmSync(transcodePath, { recursive: true })
}

export const handlePostTranscode = async ({
  filePath,
  mediaTitle,
  mediaType,
}: {
  filePath: string
  mediaTitle: string
  mediaType: 'movie' | 'show'
}): Promise<void> => {
  await cleanUp(filePath, mediaTitle)

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
