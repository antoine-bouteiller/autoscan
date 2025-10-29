import { join } from 'node:path'

import { handleError } from '@/app/exceptions/handler'
import { getSections, refreshSection } from '@/app/services/integrations/plex_service'
import { getLanguage } from '@/app/services/media/language_service'
import { TranscodeOrchestrator } from '@/app/services/transcode/transcode_orchestrator'
import { sonarrValidator } from '@/app/validators/http/sonarr_webhook_validator'

export const sonarrWebhook = async (request: Request) => {
  const body = await request.json()
  const { success, data, error } = sonarrValidator.safeParse(body)

  if (!success) {
    handleError(error, { body })
    return Response.json({ message: 'invalid request' }, { status: 400 })
  }

  const { eventType } = data

  if (eventType === 'Test') {
    return Response.json({ message: 'ok' })
  }

  if (eventType === 'Download') {
    const file = join(data.series.path, data.episodeFile.relativePath)

    const originalLanguage = await getLanguage(data.series.tmdbId, 'show')

    const transcodeService = new TranscodeOrchestrator(
      file,
      `${data.series.title} ${data.episodes[0]?.title}`,
      originalLanguage
    )

    await transcodeService.transcodeFile()
  }

  const sections = await getSections()

  await Promise.all(
    sections
      .filter((section) => section.type === 'show')
      .map((section) => refreshSection(section.key, data.series.path))
  )

  return Response.json({ message: 'ok' })
}
