import { ArkErrors } from 'arktype'
import { join } from 'node:path'

import { badRequest, success } from '@/core/response'
import { getMediaLanguage } from '@/features/metadata/service'
import { transcodeFile } from '@/features/transcode/service'
import { logError } from '@/utils/error_handler'

import { radarrValidator } from './validators'

export const radarrWebhook = async (request: Request) => {
  const body = await request.json()
  const data = radarrValidator(body)

  if (data instanceof ArkErrors) {
    logError(data, 'Radarr')
    return badRequest('invalid request', data.summary)
  }

  const { eventType } = data

  if (eventType === 'Test') {
    return success({ message: 'ok' })
  }

  if (eventType === 'Download') {
    const file = join(data.movie.folderPath, data.movieFile.relativePath)
    const mediaTitle = data.movie.title
    const { originalLanguage } = await getMediaLanguage(data.movie.tmdbId, 'movie')

    void transcodeFile(file, mediaTitle, originalLanguage, 'movie')
  }

  return success({ message: 'ok' })
}
