import { join } from 'node:path'

import * as v from 'valibot'

import { badRequest, success } from '@/core/response'
import { getMediaLanguage } from '@/services/metadata.service'
import { transcodeFile } from '@/services/transcode/transcode.service'
import { sonarrValidator } from '@/validators/sonarr.validator'

import { logError } from '../utils/error'

export const sonarrWebhook = async (request: Request) => {
  const body = await request.json()
  const parsed = v.safeParse(sonarrValidator, body)

  if (!parsed.success) {
    logError(parsed.issues, 'Sonarr')
    return badRequest('invalid request', v.flatten(parsed.issues))
  }

  const { eventType } = parsed.output

  if (eventType === 'Test') {
    return success({ message: 'ok' })
  }

  if (eventType === 'Download') {
    const file = join(parsed.output.series.path, parsed.output.episodeFile.relativePath)
    const mediaTitle = `${parsed.output.series.title} ${parsed.output.episodes[0]?.title}`
    const { originalLanguage } = await getMediaLanguage(parsed.output.series.tmdbId, 'show')

    void transcodeFile(file, mediaTitle, originalLanguage, 'show')
  }

  return success({ message: 'ok' })
}
