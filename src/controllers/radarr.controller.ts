import { join } from 'node:path'

import { type FastifyReply, type FastifyRequest } from 'fastify'
import { z } from 'zod'

import { badRequest, success } from '#core/response'
import { getMediaLanguage } from '#services/metadata.service'
import { transcodeFile } from '#services/transcode/transcode.service'
import { logError } from '#utils/error'
import { radarrValidator } from '#validators/radarr.validator'

export const radarrWebhook = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = radarrValidator.safeParse(request.body)

  if (!parsed.success) {
    logError(parsed.error.issues, 'Radarr')
    return badRequest(reply, 'invalid request', z.treeifyError(parsed.error))
  }

  const { eventType } = parsed.data

  if (eventType === 'Test') {
    return success(reply, { message: 'ok' })
  }

  if (eventType === 'Download') {
    const file = join(parsed.data.movie.folderPath, parsed.data.movieFile.relativePath)
    const mediaTitle = parsed.data.movie.title
    const { originalLanguage } = await getMediaLanguage(parsed.data.movie.tmdbId, 'movie')

    void transcodeFile({ file, mediaTitle, mediaType: 'movie', originalLanguage })
  }

  return success(reply, { message: 'ok' })
}
