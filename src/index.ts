import { logger } from '#config/logger'
import '#core/bootstrap'
import { container, TOKENS } from '#core/container'
import { type HttpProvider } from '#providers/http/http.provider'
import { type SchedulerProvider } from '#providers/scheduler/scheduler.provider'
import { type TelegramProvider } from '#providers/telegram/telegram.provider'

const httpProvider = container.resolve<HttpProvider>(TOKENS.HTTP_PROVIDER)
const schedulerProvider = container.resolve<SchedulerProvider>(TOKENS.SCHEDULER_PROVIDER)
const telegramProvider = container.resolve<TelegramProvider>(TOKENS.TELEGRAM_PROVIDER)

await httpProvider.start()

telegramProvider.start()

process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...')

  await httpProvider.stop()
  schedulerProvider.stopAll()
  await telegramProvider.stop()

  process.exit(0)
})
