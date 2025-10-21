import { join } from 'node:path'

import { handleError } from '@/app/exceptions/handler'
import { getLanguage } from '@/app/services/media/language_service'
import { getSections, refreshSection } from '@/app/services/integrations/plex_service'
import { TranscodeOrchestrator } from '@/app/services/transcode/transcode_orchestrator'
import { radarrValidator } from '@/app/validators/http/radarr_webhook_validator'

export const radarrWebhook = async (request: Request) => {
  const body = radarrValidator.parse(request.body)

  const { eventType } = body

  if (eventType === 'Test') {
    return Response.json({ message: 'ok' })
  }

  try {
    if (eventType === 'Download') {
      const file = join(body.movie.folderPath, body.movieFile.relativePath)
      const originalLanguage = await getLanguage(body.movie.tmdbId, 'movie')

      const transcodeService = new TranscodeOrchestrator(file, body.movie.title, originalLanguage)

      await transcodeService.transcodeFile()
    }
    const sections = await getSections()

    await Promise.all(
      sections
        .filter((section) => section.type === 'movie')
        .map((section) => refreshSection(section.key, body.movie.folderPath))
    )
  } catch (error) {
    handleError(error)
  }

  return Response.json({ message: 'ok' })
}
