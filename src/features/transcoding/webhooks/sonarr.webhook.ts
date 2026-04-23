import { join } from 'node:path'

import { type z } from 'zod'

import { container, TOKENS } from '#/core/container'
import { getMediaLanguage } from '#/domains/media/services/metadata.service'
import { transcodeFile } from '#/features/transcoding/services/transcode.service'
import { type sonarrValidator } from '#/integrations/arr/sonarr.validator'
import { success } from '#/providers/http/response'
import { type AppReply, type AppRequest } from '#/providers/http/types'

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
      const plexClient = container.resolve(TOKENS.PLEX_CLIENT)
      await plexClient.refreshSections(file, 'show')
    }
  }

  return success(reply, { message: 'ok' })
}
