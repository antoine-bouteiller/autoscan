import { container, TOKENS } from '#core/container'
import { type SchedulerProvider } from '#providers/scheduler/scheduler.provider'
import { type TelegramProvider } from '#providers/telegram/telegram.provider'

import { syncTraktCommand, traktAuthCommand } from './commands/trakt.command.js'
import { traktSyncJob } from './jobs/trakt.job.js'

export const registerTraktSync = () => {
  const scheduler = container.resolve<SchedulerProvider>(TOKENS.SCHEDULER_PROVIDER)
  const telegram = container.resolve<TelegramProvider>(TOKENS.TELEGRAM_PROVIDER)

  scheduler.register({
    handler: traktSyncJob,
    name: 'Trakt Sync',
    pattern: '0 0 */12 * * *',
  })

  telegram.registerCommand('/trakt', traktAuthCommand)
  telegram.registerCommand('/synctrakt', syncTraktCommand)
}
