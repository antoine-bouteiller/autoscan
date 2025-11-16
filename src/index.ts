import { logger } from '@/config/logger'
import { getHttpProvider } from '@/providers/http_provider'
import { getSchedulerProvider } from '@/providers/scheduler_provider'
import { getTelegramProvider } from '@/providers/telegram_provider'
import '@/start/routes'
import '@/start/scheduler'

const httpProvider = getHttpProvider()
const schedulerProvider = getSchedulerProvider()
const telegramProvider = getTelegramProvider()

httpProvider.start()

if (process.env.NODE_ENV !== 'development') {
  telegramProvider.start()
}

process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...')

  httpProvider.stop()
  schedulerProvider.stopAll()
  await telegramProvider.stop()

  process.exit(0)
})
