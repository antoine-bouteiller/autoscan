import { defineFeature } from '#/core/feature'

import { syncTraktCommand, traktAuthCommand } from './commands/trakt.command.js'
import { traktSyncJob } from './jobs/trakt.job.js'

export const traktSyncFeature = defineFeature({
  commands: {
    '/synctrakt': syncTraktCommand,
    '/trakt': traktAuthCommand,
  },
  jobs: [{ handler: traktSyncJob, name: 'Trakt Sync', pattern: '0 0 */12 * * *' }],
  name: 'trakt_sync',
})
