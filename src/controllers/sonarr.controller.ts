import { join } from 'node:path'

import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { badRequest, success } from '#core/response'
import { getMediaLanguage } from '#services/metadata.service'
import { transcodeFile } from '#services/transcode/transcode.service'
import { logError } from '#utils/error'
import { sonarrValidator } from '#validators/sonarr.validator'

export const sonarrWebhook = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = sonarrValidator.safeParse(request.body)

  if (!parsed.success) {
    logError(parsed.error.issues, 'Sonarr')
    return badRequest(reply, 'invalid request', z.treeifyError(parsed.error))
  }

  const { eventType } = parsed.data

  if (eventType === 'Test') {
    return success(reply, { message: 'ok' })
  }

  if (eventType === 'Download') {
    const file = join(parsed.data.series.path, parsed.data.episodeFile.relativePath)
    const mediaTitle = `${parsed.data.series.title} ${parsed.data.episodes[0]?.title}`
    const { originalLanguage } = await getMediaLanguage(parsed.data.series.tmdbId, 'show')

    void transcodeFile(file, mediaTitle, originalLanguage, 'show')
  }

  return success(reply, { message: 'ok' })
}
