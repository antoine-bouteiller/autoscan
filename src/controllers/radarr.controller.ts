import { join } from 'node:path'

import { type z } from 'zod'

import { container, TOKENS } from '#core/container'
import { success } from '#core/response'
import { type IPlexClient } from '#integrations/plex.service'
import { getMediaLanguage } from '#services/metadata.service'
import { transcodeFile } from '#services/transcode/transcode.service'
import { type AppReply, type AppRequest } from '#types/http'
import { type radarrValidator } from '#validators/radarr.validator'

export const radarrWebhook = async (request: AppRequest<z.infer<typeof radarrValidator>>, reply: AppReply) => {
  const { eventType } = request.body

  if (eventType === 'Test') {
    return success(reply, { message: 'ok' })
  }

  if (eventType === 'Download') {
    const file = join(request.body.movie.folderPath, request.body.movieFile.relativePath)
    const mediaTitle = request.body.movie.title
    const { originalLanguage } = await getMediaLanguage(request.body.movie.tmdbId, 'movie')

    const transcoded = await transcodeFile({ file, mediaTitle, mediaType: 'movie', originalLanguage })

    if (!transcoded) {
      const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)
      await plexClient.refreshSections(file, 'movie')
    }
  }

  return success(reply, { message: 'ok' })
}
