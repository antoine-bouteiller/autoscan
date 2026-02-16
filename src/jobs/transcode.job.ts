import { Effect } from 'effect'

import { MetadataService } from '@/services/metadata.service'
import { TranscodeService } from '@/services/transcode/transcode.service'

export const runTranscodeProcess = Effect.gen(function* () {
  const metadataService = yield* MetadataService
  const transcodeService = yield* TranscodeService

  yield* Effect.logInfo('Starting transcode scan...').pipe(Effect.annotateLogs({ context: 'Transcode' }))

  yield* metadataService.forEachMedia((details) =>
    transcodeService.transcodeFile(details.file, details.mediaTitle, details.originalLanguage, details.mediaType).pipe(Effect.asVoid)
  )

  yield* Effect.logInfo('Transcode scan finished').pipe(Effect.annotateLogs({ context: 'Transcode' }))
})
