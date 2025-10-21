import '@/app/services/ip_service'
import { server } from '@/start/server'
import { logger } from '@/config/logger'
import '@/start/cron'

if (process.env.NODE_ENV !== 'development') {
  void import('@/start/telegram')
}

logger.info(`Server running at ${server.url}`)
