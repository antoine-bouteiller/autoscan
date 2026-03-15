import { join } from 'node:path'

import type { FastifyReply, FastifyRequest } from 'fastify'
import * as v from 'valibot'

import { badRequest, success } from '#core/response'
import { getMediaLanguage } from '#services/metadata.service'
import { transcodeFile } from '#services/transcode/transcode.service'
import { logError } from '#utils/error'
import { sonarrValidator } from '#validators/sonarr.validator'

export const sonarrWebhook = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = v.safeParse(sonarrValidator, request.body)

  if (!parsed.success) {
    logError(parsed.issues, 'Sonarr')
    return badRequest(reply, 'invalid request', v.flatten(parsed.issues))
  }

  const { eventType } = parsed.output

  if (eventType === 'Test') {
    return success(reply, { message: 'ok' })
  }

  if (eventType === 'Download') {
    const file = join(parsed.output.series.path, parsed.output.episodeFile.relativePath)
    const mediaTitle = `${parsed.output.series.title} ${parsed.output.episodes[0]?.title}`
    const { originalLanguage } = await getMediaLanguage(parsed.output.series.tmdbId, 'show')

    void transcodeFile(file, mediaTitle, originalLanguage, 'show')
  }

  return success(reply, { message: 'ok' })
}
