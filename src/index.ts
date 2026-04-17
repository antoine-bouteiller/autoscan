import { logger } from '#config/logger'
import '#core/bootstrap'
import { container, TOKENS } from '#core/container'

const httpProvider = container.resolve(TOKENS.HTTP_PROVIDER)
const schedulerProvider = container.resolve(TOKENS.SCHEDULER_PROVIDER)
const telegramProvider = container.resolve(TOKENS.TELEGRAM_PROVIDER)

await httpProvider.start()

telegramProvider.start()

process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...')

  await httpProvider.stop()
  schedulerProvider.stopAll()
  await telegramProvider.stop()

  process.exit(0)
})
