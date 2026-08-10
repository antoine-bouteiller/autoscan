import { Cause, Effect } from 'effect'

import { syncPlexToTrakt } from '@/features/trakt_sync/services/plextraktsync.service'

export const traktSyncJob = syncPlexToTrakt.pipe(
  Effect.catchCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause) : Effect.logError(cause, 'Trakt Sync Job'))),
  Effect.asVoid
)
