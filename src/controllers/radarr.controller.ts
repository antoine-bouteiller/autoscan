import { join } from 'node:path'

import { z } from 'zod'

import { container, TOKENS } from '#core/container'
import { badRequest, success } from '#core/response'
import { type IPlexClient } from '#integrations/plex.service'
import { getMediaLanguage } from '#services/metadata.service'
import { transcodeFile } from '#services/transcode/transcode.service'
import { type AppReply, type AppRequest } from '#types/http'
import { logError } from '#utils/error'
import { radarrValidator } from '#validators/radarr.validator'

export const radarrWebhook = async (request: AppRequest, reply: AppReply) => {
  const parsed = radarrValidator.safeParse(request.body)

  if (!parsed.success) {
    logError(parsed.error.issues, 'Radarr')
    return badRequest(reply, 'invalid request', z.treeifyError(parsed.error))
  }

  const { eventType } = parsed.data

  if (eventType === 'Test') {
    return success(reply, { message: 'ok' })
  }

  if (eventType === 'Download') {
    const file = join(parsed.data.movie.folderPath, parsed.data.movieFile.relativePath)
    const mediaTitle = parsed.data.movie.title
    const { originalLanguage } = await getMediaLanguage(parsed.data.movie.tmdbId, 'movie')

    const transcoded = await transcodeFile({ file, mediaTitle, mediaType: 'movie', originalLanguage })

    if (!transcoded) {
      const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)
      await plexClient.refreshSections(file, 'movie')
    }
  }

  return success(reply, { message: 'ok' })
}
