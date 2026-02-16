import { HttpServerRequest, HttpServerResponse } from '@effect/platform'
import { Effect } from 'effect'
import { join } from 'node:path'

import { RadarrWebhook } from '@/schemas/radarr'
import { MetadataService } from '@/services/metadata.service'
import { TranscodeService } from '@/services/transcode/transcode.service'

export const radarrWebhook = Effect.gen(function* () {
  const body = yield* HttpServerRequest.schemaBodyJson(RadarrWebhook)
  const { eventType } = body

  if (eventType === 'Test') {
    return yield* HttpServerResponse.json({ message: 'ok' })
  }

  if (eventType === 'Download') {
    const file = join(body.movie.folderPath, body.movieFile.relativePath)
    const mediaTitle = body.movie.title

    const metadataService = yield* MetadataService
    const transcodeService = yield* TranscodeService

    const { originalLanguage } = yield* metadataService.getMediaLanguage(body.movie.tmdbId, 'movie')
    yield* Effect.fork(transcodeService.transcodeFile(file, mediaTitle, originalLanguage, 'movie'))
  }

  return yield* HttpServerResponse.json({ message: 'ok' })
}).pipe(Effect.catchTag('ParseError', (error) => HttpServerResponse.json({ error: 'invalid request', details: error.message }, { status: 400 })))
