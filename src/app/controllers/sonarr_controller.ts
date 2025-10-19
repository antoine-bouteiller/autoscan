import type { FastifyReply, FastifyRequest } from 'fastify'

import { join } from 'node:path'

import { handleError } from '@/app/exceptions/handler'
import { getLanguage } from '@/app/services/language_service'
import { getSections, refreshSection } from '@/app/services/plex_service'
import { TranscodeService } from '@/app/services/transcode_service'
import { sonarrValidator } from '@/app/validators/sonarr_validator'

export const sonarrWebhook = async (request: FastifyRequest, response: FastifyReply) => {
  const body = sonarrValidator.parse(request.body)

  const eventType = body.eventType

  if ('Test' === eventType) {
    response.send('ok')
    return
  }

  try {
    if ('Download' === eventType) {
      const file = join(body.series.path, body.episodeFile.relativePath)

      const originalLanguage = await getLanguage(body.series.tmdbId, 'show')

      const transcodeService = new TranscodeService(
        file,
        `${body.series.title} ${body.episodes[0]?.title}`,
        originalLanguage
      )

      await transcodeService.transcodeFile()
    }

    const sections = await getSections()

    await Promise.all(
      sections
        .filter((section) => 'show' === section.type)
        .map((section) => refreshSection(section.key, body.series.path))
    )
  } catch (error) {
    handleError(error)
  }

  response.send('ok')
}
