import { join } from 'node:path'

import { type z } from 'zod'

import { container, TOKENS } from '#core/container'
import { success } from '#core/response'
import { type IPlexClient } from '#integrations/plex.service'
import { getMediaLanguage } from '#services/metadata.service'
import { transcodeFile } from '#services/transcode/transcode.service'
import { type AppReply, type AppRequest } from '#types/http'
import { type sonarrValidator } from '#validators/sonarr.validator'

export const sonarrWebhook = async (request: AppRequest<z.infer<typeof sonarrValidator>>, reply: AppReply) => {
  const { eventType } = request.body

  if (eventType === 'Test') {
    return success(reply, { message: 'ok' })
  }

  if (eventType === 'Download') {
    const file = join(request.body.series.path, request.body.episodeFile.relativePath)
    const mediaTitle = `${request.body.series.title} ${request.body.episodes[0]?.title}`
    const { originalLanguage } = await getMediaLanguage(request.body.series.tmdbId, 'show')

    const transcoded = await transcodeFile({ file, mediaTitle, mediaType: 'show', originalLanguage })

    if (!transcoded) {
      const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)
      await plexClient.refreshSections(file, 'show')
    }
  }

  return success(reply, { message: 'ok' })
}
