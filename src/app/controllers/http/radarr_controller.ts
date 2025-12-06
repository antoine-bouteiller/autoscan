import { ArkErrors } from 'arktype'
import { join } from 'node:path'

import { handleError } from '@/app/exceptions/handler'
import { getOriginalLanguage } from '@/app/services/media/metadata_service'
import { transcodeFile } from '@/app/services/transcode/transcode_service'
import { radarrValidator } from '@/app/validators/http/radarr_webhook_validator'

export const radarrWebhook = async (request: Request) => {
  const body = await request.json()
  const data = radarrValidator(body)

  if (data instanceof ArkErrors) {
    handleError(data, { body })
    return Response.json({ message: 'invalid request' }, { status: 400 })
  }

  const { eventType } = data

  if (eventType === 'Test') {
    return Response.json({ message: 'ok' })
  }

  if (eventType === 'Download') {
    const file = join(data.movie.folderPath, data.movieFile.relativePath)
    const mediaTitle = data.movie.title
    const originalLanguage = await getOriginalLanguage(data.movie.tmdbId, 'movie')

    transcodeFile(file, mediaTitle, originalLanguage, 'movie')
  }

  return Response.json({ message: 'ok' })
}
