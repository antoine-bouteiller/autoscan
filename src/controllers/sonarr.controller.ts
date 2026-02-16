import { HttpServerRequest, HttpServerResponse } from '@effect/platform'
import { Effect } from 'effect'
import { join } from 'node:path'

import { SonarrWebhook } from '@/schemas/sonarr'
import { MetadataService } from '@/services/metadata.service'
import { TranscodeService } from '@/services/transcode/transcode.service'

export const sonarrWebhook = Effect.gen(function* () {
  const body = yield* HttpServerRequest.schemaBodyJson(SonarrWebhook)
  const { eventType } = body

  if (eventType === 'Test') {
    return yield* HttpServerResponse.json({ message: 'ok' })
  }

  if (eventType === 'Download') {
    const file = join(body.series.path, body.episodeFile.relativePath)
    const mediaTitle = `${body.series.title} ${body.episodes[0]?.title}`

    const metadataService = yield* MetadataService
    const transcodeService = yield* TranscodeService

    const { originalLanguage } = yield* metadataService.getMediaLanguage(body.series.tmdbId, 'show')
    yield* Effect.fork(transcodeService.transcodeFile(file, mediaTitle, originalLanguage, 'show'))
  }

  return yield* HttpServerResponse.json({ message: 'ok' })
}).pipe(Effect.catchTag('ParseError', (error) => HttpServerResponse.json({ error: 'invalid request', details: error.message }, { status: 400 })))
