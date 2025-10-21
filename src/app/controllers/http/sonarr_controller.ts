import { join } from 'node:path'

import { handleError } from '@/app/exceptions/handler'
import { getLanguage } from '@/app/services/media/language_service'
import { getSections, refreshSection } from '@/app/services/integrations/plex_service'
import { TranscodeOrchestrator } from '@/app/services/transcode/transcode_orchestrator'
import { sonarrValidator } from '@/app/validators/http/sonarr_webhook_validator'

export const sonarrWebhook = async (request: Request) => {
  const body = sonarrValidator.parse(request.body)

  const { eventType } = body

  if (eventType === 'Test') {
    return Response.json({ message: 'ok' })
  }

  try {
    if (eventType === 'Download') {
      const file = join(body.series.path, body.episodeFile.relativePath)

      const originalLanguage = await getLanguage(body.series.tmdbId, 'show')

      const transcodeService = new TranscodeOrchestrator(
        file,
        `${body.series.title} ${body.episodes[0]?.title}`,
        originalLanguage
      )

      await transcodeService.transcodeFile()
    }

    const sections = await getSections()

    await Promise.all(
      sections
        .filter((section) => section.type === 'show')
        .map((section) => refreshSection(section.key, body.series.path))
    )
  } catch (error) {
    handleError(error)
  }

  return Response.json({ message: 'ok' })
}
