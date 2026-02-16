import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { Effect } from 'effect'

import type { RadarrClient } from '@/integrations/arr/radarr.service'
import type { SonarrClient } from '@/integrations/arr/sonarr.service'
import type { FfmpegClient } from '@/integrations/ffmpeg.service'
import type { PlexClient } from '@/integrations/plex.service'

interface TranscodeServices {
  ffmpegClient: FfmpegClient
  plexClient: PlexClient
  radarrClient: RadarrClient
  sonarrClient: SonarrClient
}

const cleanUp = (id: number, file: string, mediaTitle: string, ffmpegClient: TranscodeServices['ffmpegClient']) =>
  Effect.gen(function* () {
    const paths = file.split('/')
    paths.pop()

    const transcodePath = `${paths.join('/')}/transcode/${id}`

    if (!existsSync(transcodePath)) {
      return
    }

    const files = readdirSync(transcodePath)
    const videoFile = files.find((f) => f.endsWith('.mp4'))

    if (!videoFile) {
      yield* Effect.logError(`No mp4 video file found`).pipe(Effect.annotateLogs({ context: 'postTranscode', media: mediaTitle }))
      rmSync(transcodePath, { recursive: true })
      return
    }

    const streams = yield* ffmpegClient.ffprobe(join(transcodePath, videoFile))

    const videoStreams = streams.filter((stream) => stream.codec_type === 'video')
    const audioStreams = streams.filter((stream) => stream.codec_type === 'audio')

    if (videoStreams.length === 0 || audioStreams.length === 0) {
      yield* Effect.logError(`No audio or video stream found on transcoded file`).pipe(
        Effect.annotateLogs({ context: 'postTranscode', media: mediaTitle })
      )
    } else {
      rmSync(file)
      for (const f of files) {
        copyFileSync(join(transcodePath, f), `${paths.join('/')}/${f}`)
      }
    }

    rmSync(transcodePath, { recursive: true })
  })

export const handlePostTranscode = (
  {
    filePath,
    id,
    mediaTitle,
    mediaType,
  }: {
    filePath: string
    id: number
    mediaTitle: string
    mediaType: 'movie' | 'show'
  },
  services: TranscodeServices
) =>
  Effect.gen(function* () {
    yield* cleanUp(id, filePath, mediaTitle, services.ffmpegClient)

    const sections = yield* services.plexClient.getSections()
    const fileDirectory = resolve(filePath, '..')

    if (mediaType === 'movie') {
      const movieId = yield* services.radarrClient.getMovieByPath(filePath)

      if (!movieId) {
        yield* Effect.logWarning(`Could not find movie in Radarr for path: ${filePath}`).pipe(
          Effect.annotateLogs({ context: 'postTranscode', media: mediaTitle })
        )
        return
      }

      yield* services.radarrClient.refreshMovie(movieId)
      yield* services.radarrClient.renameMovie(movieId)
    } else {
      const seriesId = yield* services.sonarrClient.getSeriesByPath(filePath)

      if (!seriesId) {
        yield* Effect.logWarning(`Could not find series in Sonarr for path: ${filePath}`).pipe(
          Effect.annotateLogs({ context: 'postTranscode', media: mediaTitle })
        )
        return
      }

      yield* services.sonarrClient.refreshSeries(seriesId)
      yield* services.sonarrClient.renameSeries(seriesId)
    }

    const mediaSections = sections.filter((section) => section.type === mediaType)

    for (const section of mediaSections) {
      yield* services.plexClient.refreshSection(section.key, fileDirectory)
    }
  }).pipe(Effect.catchAll((error) => Effect.logError(String(error)).pipe(Effect.annotateLogs({ context: 'postTranscode', media: mediaTitle }))))
