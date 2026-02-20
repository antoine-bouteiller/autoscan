import { join } from 'node:path'

import * as v from 'valibot'

import { badRequest, success } from '@/core/response'
import { getMediaLanguage } from '@/services/metadata.service'
import { transcodeFile } from '@/services/transcode/transcode.service'
import { radarrValidator } from '@/validators/radarr.validator'

import { logError } from '../utils/error'

export const radarrWebhook = async (request: Request) => {
  const body = await request.json()
  const parsed = v.safeParse(radarrValidator, body)

  if (!parsed.success) {
    logError(parsed.issues, 'Radarr')
    return badRequest('invalid request', v.flatten(parsed.issues))
  }

  const { eventType } = parsed.output

  if (eventType === 'Test') {
    return success({ message: 'ok' })
  }

  if (eventType === 'Download') {
    const file = join(parsed.output.movie.folderPath, parsed.output.movieFile.relativePath)
    const mediaTitle = parsed.output.movie.title
    const { originalLanguage } = await getMediaLanguage(parsed.output.movie.tmdbId, 'movie')

    void transcodeFile(file, mediaTitle, originalLanguage, 'movie')
  }

  return success({ message: 'ok' })
}
