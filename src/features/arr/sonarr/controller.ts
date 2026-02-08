import { ArkErrors } from 'arktype'
import { join } from 'node:path'

import { badRequest, success } from '@/core/response'
import { getMediaLanguage } from '@/features/metadata/service'
import { transcodeFile } from '@/features/transcode/service'
import { logError } from '@/utils/error_handler'

import { sonarrValidator } from './validators'

export const sonarrWebhook = async (request: Request) => {
  const body = await request.json()
  const data = sonarrValidator(body)

  if (data instanceof ArkErrors) {
    logError(data, 'Sonarr')
    return badRequest('invalid request', data.summary)
  }

  const { eventType } = data

  if (eventType === 'Test') {
    return success({ message: 'ok' })
  }

  if (eventType === 'Download') {
    const file = join(data.series.path, data.episodeFile.relativePath)
    const mediaTitle = `${data.series.title} ${data.episodes[0]?.title}`
    const { originalLanguage } = await getMediaLanguage(data.series.tmdbId, 'show')

    void transcodeFile(file, mediaTitle, originalLanguage, 'show')
  }

  return success({ message: 'ok' })
}
