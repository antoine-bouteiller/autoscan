import { Effect, Path } from 'effect'

import { Plex } from '@/core/runtime.service'
import { getMediaLanguage } from '@/domains/media/services/metadata.service'
import { transcodeFile } from '@/features/transcoding/services/transcode.service'
import { type radarrValidator } from '@/integrations/arr/radarr.validator'
import { success } from '@/providers/http/response'
import { type AppReply, type AppRequest } from '@/providers/http/types'

export const radarrWebhook = (request: AppRequest<typeof radarrValidator.Type>, reply: AppReply) =>
  Effect.gen(function* () {
    if (request.body.eventType === 'Download') {
      const path = yield* Path.Path
      const file = path.join(request.body.movie.folderPath, request.body.movieFile.relativePath)
      const { originalLanguage } = yield* getMediaLanguage(request.body.movie.tmdbId, 'movie')
      const transcoded = yield* transcodeFile({ file, mediaTitle: request.body.movie.title, mediaType: 'movie', originalLanguage })
      if (!transcoded) {
        const plex = yield* Plex
        yield* plex.refreshSections(file, 'movie')
      }
    }
    success(reply, { message: 'ok' })
  })
