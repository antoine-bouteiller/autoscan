import { Effect } from 'effect'

import { syncPlexToTrakt } from '@/features/trakt_sync/services/plextraktsync.service'
import { logError } from '@/shared/utils/error'

export const traktSyncJob = syncPlexToTrakt.pipe(
  Effect.catch((error) => Effect.sync(() => logError(error, 'Trakt Sync Job'))),
  Effect.asVoid
)
