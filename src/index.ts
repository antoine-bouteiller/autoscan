import '@/start/cron'
import '@/start/server'
import '@/app/services/ip_service'

if ('development' !== process.env.NODE_ENV) {
  void import('@/start/telegram')
}
