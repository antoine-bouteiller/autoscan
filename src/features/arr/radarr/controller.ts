import { ArkErrors } from 'arktype'
import { join } from 'node:path'

import { getMediaLanguage } from '@/features/metadata/service'
import { transcodeFile } from '@/features/transcode/service'
import { handleError } from '@/utils/error_handler'

import { radarrValidator } from './validator'

export const radarrWebhook = async (request: Request) => {
  const body = await request.json()
  const data = radarrValidator(body)

  if (data instanceof ArkErrors) {
    handleError(data, 'Radarr')
    return Response.json({ message: 'invalid request' }, { status: 400 })
  }

  const { eventType } = data

  if (eventType === 'Test') {
    return Response.json({ message: 'ok' })
  }

  if (eventType === 'Download') {
    const file = join(data.movie.folderPath, data.movieFile.relativePath)
    const mediaTitle = data.movie.title
    const { originalLanguage } = await getMediaLanguage(data.movie.tmdbId, 'movie')

    transcodeFile(file, mediaTitle, originalLanguage, 'movie')
  }

  return Response.json({ message: 'ok' })
}
