import { syncPlexToTrakt } from '#features/trakt_sync/services/plextraktsync.service'
import { isError, logError } from '#shared/utils/error'

export const traktSyncJob = async () => {
  const result = await syncPlexToTrakt()

  if (isError(result)) {
    logError(result, 'Trakt Sync Job')
  }
}
