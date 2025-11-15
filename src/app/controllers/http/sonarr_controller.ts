import { join } from 'node:path'

import { handleError } from '@/app/exceptions/handler'
import { getOriginalLanguage } from '@/app/services/media/metadata_service'
import { transcodeFile } from '@/app/services/transcode/transcode_service'
import { sonarrValidator } from '@/app/validators/http/sonarr_webhook_validator'

export const sonarrWebhook = async (request: Request) => {
  const body = await request.json()
  const { success, data, error } = sonarrValidator.safeParse(body)

  if (!success) {
    handleError(error, { body })
    return Response.json({ message: 'invalid request' }, { status: 400 })
  }

  const { eventType } = data

  if (eventType === 'Test') {
    return Response.json({ message: 'ok' })
  }

  if (eventType === 'Download') {
    const file = join(data.series.path, data.episodeFile.relativePath)
    const mediaTitle = `${data.series.title} ${data.episodes[0]?.title}`
    const originalLanguage = await getOriginalLanguage(data.series.tmdbId, 'show')

    transcodeFile(file, mediaTitle, originalLanguage, 'show')
  }

  return Response.json({ message: 'ok' })
}
