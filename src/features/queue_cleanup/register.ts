import { container, TOKENS } from '#core/container'
import { type SchedulerProvider } from '#providers/scheduler/scheduler.provider'

import { runCleanupProcess } from './jobs/cleanup.job.js'

export const registerQueueCleanup = () => {
  const scheduler = container.resolve<SchedulerProvider>(TOKENS.SCHEDULER_PROVIDER)

  scheduler.register({
    handler: runCleanupProcess,
    name: 'Cleanup',
    pattern: '0 */10 * * * *',
  })
}
