import type { FastifyReply, FastifyRequest } from 'fastify'

import { join } from 'node:path'

import { handleError } from '@/app/exceptions/handler'
import { getLanguage } from '@/app/services/language_service'
import { getSections, refreshSection } from '@/app/services/plex_service'
import { TranscodeService } from '@/app/services/transcode_service'
import { radarrValidator } from '@/app/validators/radarr_validator'

export const radarrWebhook = async (request: FastifyRequest, response: FastifyReply) => {
  const body = radarrValidator.parse(request.body)

  const eventType = body.eventType

  if ('Test' === eventType) {
    response.send('ok')
    return
  }

  try {
    if ('Download' === eventType) {
      const file = join(body.movie.folderPath, body.movieFile.relativePath)
      const originalLanguage = await getLanguage(body.movie.tmdbId, 'movie')

      const transcodeService = new TranscodeService(file, body.movie.title, originalLanguage)

      await transcodeService.transcodeFile()
    }
    const sections = await getSections()

    await Promise.all(
      sections
        .filter((section) => 'movie' === section.type)
        .map((section) => refreshSection(section.key, body.movie.folderPath))
    )
  } catch (error) {
    handleError(error)
  }

  response.send('ok')
}
