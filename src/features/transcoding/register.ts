import { container, TOKENS } from '#core/container'
import { radarrValidator } from '#integrations/arr/radarr.validator'
import { sonarrValidator } from '#integrations/arr/sonarr.validator'
import { type HttpProvider } from '#providers/http/http.provider'
import { type SchedulerProvider } from '#providers/scheduler/scheduler.provider'
import { type TelegramProvider } from '#providers/telegram/telegram.provider'

import { subtitleScanCommand } from './commands/subtitle_scan.command.js'
import { transcodeCommand } from './commands/transcode.command.js'
import { runTranscodeProcess } from './jobs/transcode.job.js'
import { radarrWebhook } from './webhooks/radarr.webhook.js'
import { sonarrWebhook } from './webhooks/sonarr.webhook.js'

export const registerTranscoding = () => {
  const http = container.resolve<HttpProvider>(TOKENS.HTTP_PROVIDER)
  const scheduler = container.resolve<SchedulerProvider>(TOKENS.SCHEDULER_PROVIDER)
  const telegram = container.resolve<TelegramProvider>(TOKENS.TELEGRAM_PROVIDER)

  http.post('/radarr', radarrValidator, radarrWebhook)
  http.post('/sonarr', sonarrValidator, sonarrWebhook)

  scheduler.register({
    handler: runTranscodeProcess,
    name: 'Transcode',
    pattern: '0 0 */12 * * *',
  })

  telegram.registerCommand('/transcode', transcodeCommand)
  telegram.registerCommand('/subtitlescan', subtitleScanCommand)
}
