import { Effect } from 'effect'

import { CleanupService } from '@/services/cleanup.service'

export const runCleanupProcess = Effect.gen(function* () {
  const cleanupService = yield* CleanupService
  yield* cleanupService.cleanupAll()
})
