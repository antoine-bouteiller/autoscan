import { join } from 'node:path'

import { Effect } from 'effect'
import { type z } from 'zod'

import { Plex } from '@/core/runtime.service'
import { getMediaLanguage } from '@/domains/media/services/metadata.service'
import { transcodeFile } from '@/features/transcoding/services/transcode.service'
import { type sonarrValidator } from '@/integrations/arr/sonarr.validator'
import { success } from '@/providers/http/response'
import { type AppReply, type AppRequest } from '@/providers/http/types'

export const sonarrWebhook = (request: AppRequest<z.infer<typeof sonarrValidator>>, reply: AppReply) =>
  Effect.gen(function* () {
    if (request.body.eventType === 'Download') {
      const file = join(request.body.series.path, request.body.episodeFile.relativePath)
      const mediaTitle = `${request.body.series.title} ${request.body.episodes[0]?.title}`
      const { originalLanguage } = yield* getMediaLanguage(request.body.series.tmdbId, 'show')
      const transcoded = yield* transcodeFile({ file, mediaTitle, mediaType: 'show', originalLanguage })
      if (!transcoded) {
        const plex = yield* Plex
        yield* plex.refreshSections(file, 'show')
      }
    }
    success(reply, { message: 'ok' })
  })
