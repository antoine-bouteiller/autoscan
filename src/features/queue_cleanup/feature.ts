import { defineFeature } from '#/core/feature'

import { runCleanupProcess } from './jobs/cleanup.job.js'

export const queueCleanupFeature = defineFeature({
  jobs: [{ handler: runCleanupProcess, name: 'Cleanup', pattern: '0 */10 * * * *' }],
  name: 'queue_cleanup',
})
