import { join } from 'node:path'

import { type z } from 'zod'

import { container, TOKENS } from '#core/container'
import { getMediaLanguage } from '#domains/media/services/metadata.service'
import { transcodeFile } from '#features/transcoding/services/transcode.service'
import { type radarrValidator } from '#integrations/arr/radarr.validator'
import { success } from '#providers/http/response'
import { type AppReply, type AppRequest } from '#providers/http/types'

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
      const plexClient = container.resolve(TOKENS.PLEX_CLIENT)
      await plexClient.refreshSections(file, 'movie')
    }
  }

  return success(reply, { message: 'ok' })
}
