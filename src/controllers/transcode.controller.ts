import { HttpServerResponse } from '@effect/platform'
import { Effect } from 'effect'

import { runTranscodeProcess } from '@/jobs/transcode.job'
import { TranscodeService } from '@/services/transcode/transcode.service'

export const transcodeAll = Effect.gen(function* () {
  const transcodeService = yield* TranscodeService
  const status = yield* transcodeService.getStatus()

  if (status.isProcessing) {
    return yield* HttpServerResponse.json({ error: 'ALREADY_RUNNING', message: 'Transcode process is already running' }, { status: 409 })
  }

  yield* Effect.fork(runTranscodeProcess)

  return yield* HttpServerResponse.json({ message: 'Transcode process started', status: 'ok' })
})
