import { getHttpProvider } from '@/providers/http_provider'
import { getSchedulerProvider } from '@/providers/scheduler_provider'
import { getTelegramProvider } from '@/providers/telegram_provider'
import '@/start/routes'
import '@/start/scheduler'
import { logger } from '@/config/logger'

const httpProvider = getHttpProvider()
const schedulerProvider = getSchedulerProvider()
const telegramProvider = getTelegramProvider()

httpProvider.start()

if (process.env.NODE_ENV !== 'development') {
  void telegramProvider.start()
}

logger.info('Application initialized successfully')

process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...')

  httpProvider.stop()
  schedulerProvider.stopAll()
  await telegramProvider.stop()

  process.exit(0)
})
