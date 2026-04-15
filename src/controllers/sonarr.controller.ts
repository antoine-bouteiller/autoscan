import { join } from 'node:path'

import { z } from 'zod'

import { container, TOKENS } from '#core/container'
import { badRequest, success } from '#core/response'
import { type IPlexClient } from '#integrations/plex.service'
import { getMediaLanguage } from '#services/metadata.service'
import { transcodeFile } from '#services/transcode/transcode.service'
import { type AppReply, type AppRequest } from '#types/http'
import { logError } from '#utils/error'
import { sonarrValidator } from '#validators/sonarr.validator'

export const sonarrWebhook = async (request: AppRequest, reply: AppReply) => {
  const parsed = sonarrValidator.safeParse(request.body)

  if (!parsed.success) {
    logError(parsed.error.issues, 'Sonarr')
    return badRequest(reply, 'invalid request', z.treeifyError(parsed.error))
  }

  const { eventType } = parsed.data

  if (eventType === 'Test') {
    return success(reply, { message: 'ok' })
  }

  if (eventType === 'Download') {
    const file = join(parsed.data.series.path, parsed.data.episodeFile.relativePath)
    const mediaTitle = `${parsed.data.series.title} ${parsed.data.episodes[0]?.title}`
    const { originalLanguage } = await getMediaLanguage(parsed.data.series.tmdbId, 'show')

    const transcoded = await transcodeFile({ file, mediaTitle, mediaType: 'show', originalLanguage })

    if (!transcoded) {
      const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)
      await plexClient.refreshSections(file, 'show')
    }
  }

  return success(reply, { message: 'ok' })
}
