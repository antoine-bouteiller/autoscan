import { syncPlexToTrakt } from '@/services/trakt.service'
import { isError, logError } from '@/utils/error'

export const traktSyncJob = async () => {
  const result = await syncPlexToTrakt()

  if (isError(result)) {
    logError(result, 'Trakt Sync Job')
  }
}
