import { ArkErrors } from 'arktype'
import { join } from 'node:path'

import { getMediaLanguage } from '@/features/metadata'
import { transcodeFile } from '@/features/transcode'
import { logError } from '@/utils/error_handler'

import { sonarrValidator } from './validator'

export const sonarrWebhook = async (request: Request) => {
  const body = await request.json()
  const data = sonarrValidator(body)

  if (data instanceof ArkErrors) {
    logError(data, 'Sonarr')
    return Response.json({ message: 'invalid request' }, { status: 400 })
  }

  const { eventType } = data

  if (eventType === 'Test') {
    return Response.json({ message: 'ok' })
  }

  if (eventType === 'Download') {
    const file = join(data.series.path, data.episodeFile.relativePath)
    const mediaTitle = `${data.series.title} ${data.episodes[0]?.title}`
    const { originalLanguage } = await getMediaLanguage(data.series.tmdbId, 'show')

    void transcodeFile(file, mediaTitle, originalLanguage, 'show')
  }

  return Response.json({ message: 'ok' })
}
