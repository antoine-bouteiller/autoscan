import { Cause, Effect } from 'effect'

import { syncPlexToTrakt } from '@/features/trakt_sync/services/plextraktsync.service'

export const traktSyncJob = syncPlexToTrakt.pipe(
  Effect.catchCauseIf(
    (cause) => !Cause.hasInterruptsOnly(cause),
    (cause) => Effect.logError(cause, 'Trakt Sync Job')
  ),
  Effect.asVoid
)
