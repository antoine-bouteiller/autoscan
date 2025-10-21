import '@/start/cron'
import '@/start/server'
import '@/app/services/ip_service'

if (process.env.NODE_ENV !== 'development') {
  void import('@/start/telegram')
}
