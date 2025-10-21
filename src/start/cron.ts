import { Cron } from 'croner'

import { updatePlexSelectedLanguages } from '@/app/controllers/language_crontroller'
import { runTranscodeProcess } from '@/app/controllers/transcode_controller'
import { cleanupAll } from '@/app/services/cleaner_service'
import { logger } from '@/config/logger'
import { dynDns } from '@/app/services/ip_service'

const startCron = (cronExpression: string, callback: () => void) => {
  const cronJob = new Cron(cronExpression)
  cronJob.schedule(callback)
  logger.info(`Cron ${cronExpression} running`)
}

startCron('0 */10 * * * *', cleanupAll)

startCron('0 0 */12 * * *', updatePlexSelectedLanguages)

startCron('0 0 */12 * * *', runTranscodeProcess)

startCron('0 */5 * * * *', dynDns)
