import { logger } from '@/config/logger'
import '@/core/bootstrap'
import { container, TOKENS } from '@/core/container'
import type { HttpProvider } from '@/providers/http_provider'
import type { SchedulerProvider } from '@/providers/scheduler_provider'
import type { TelegramProvider } from '@/providers/telegram_provider'
import '@/start/routes'
import '@/start/scheduler'
import '@/start/telegram'

const httpProvider = container.resolve<HttpProvider>(TOKENS.HTTP_PROVIDER)
const schedulerProvider = container.resolve<SchedulerProvider>(TOKENS.SCHEDULER_PROVIDER)
const telegramProvider = container.resolve<TelegramProvider>(TOKENS.TELEGRAM_PROVIDER)

export const { app } = httpProvider

if (process.env['NODE_ENV'] !== 'development') {
  await httpProvider.start()

  telegramProvider.start()

  process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...')

    await httpProvider.stop()
    schedulerProvider.stopAll()
    await telegramProvider.stop()

    process.exit(0)
  })
}
