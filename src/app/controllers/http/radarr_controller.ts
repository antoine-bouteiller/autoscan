import { join } from 'node:path'

import { handleError } from '@/app/exceptions/handler'
import { getSections, refreshSection } from '@/app/services/integrations/plex_service'
import { getOriginalLanguage } from '@/app/services/media/media_orchestration_service'
import { TranscodeOrchestrator } from '@/app/services/transcode/transcode_orchestrator'
import { radarrValidator } from '@/app/validators/http/radarr_webhook_validator'

export const radarrWebhook = async (request: Request) => {
  const body = await request.json()
  const { success, data, error } = radarrValidator.safeParse(body)

  if (!success) {
    handleError(error, { body })
    return Response.json({ message: 'invalid request' }, { status: 400 })
  }

  const { eventType } = data

  if (eventType === 'Test') {
    return Response.json({ message: 'ok' })
  }

  if (eventType === 'Download') {
    const file = join(data.movie.folderPath, data.movieFile.relativePath)
    const originalLanguage = await getOriginalLanguage(data.movie.tmdbId, 'movie')

    const transcodeService = new TranscodeOrchestrator(file, data.movie.title, originalLanguage)

    await transcodeService.transcodeFile()
  }
  const sections = await getSections()

  await Promise.all(
    sections
      .filter((section) => section.type === 'movie')
      .map((section) => refreshSection(section.key, data.movie.folderPath))
  )

  return Response.json({ message: 'ok' })
}
