import { container, TOKENS } from '#core/container'
import { type SchedulerProvider } from '#providers/scheduler/scheduler.provider'
import { type TelegramProvider } from '#providers/telegram/telegram.provider'

import { setLanguageConversation } from './commands/language.command.js'
import { updatePlexSelectedLanguages } from './jobs/language.job.js'

export const registerLanguageSync = () => {
  const scheduler = container.resolve<SchedulerProvider>(TOKENS.SCHEDULER_PROVIDER)
  const telegram = container.resolve<TelegramProvider>(TOKENS.TELEGRAM_PROVIDER)

  scheduler.register({
    handler: updatePlexSelectedLanguages,
    name: 'Language Sync',
    pattern: '0 0 */12 * * *',
  })

  telegram.registerConversation('/setlanguage', setLanguageConversation)
}
