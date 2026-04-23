import { defineFeature, postRoute } from '#/core/feature'
import { radarrValidator } from '#/integrations/arr/radarr.validator'
import { sonarrValidator } from '#/integrations/arr/sonarr.validator'

import { subtitleScanCommand } from './commands/subtitle_scan.command.js'
import { transcodeCommand } from './commands/transcode.command.js'
import { runTranscodeProcess } from './jobs/transcode.job.js'
import { radarrWebhook } from './webhooks/radarr.webhook.js'
import { sonarrWebhook } from './webhooks/sonarr.webhook.js'

export const transcodingFeature = defineFeature({
  commands: {
    '/subtitlescan': subtitleScanCommand,
    '/transcode': transcodeCommand,
  },
  jobs: [{ handler: runTranscodeProcess, name: 'Transcode', pattern: '0 0 */12 * * *' }],
  name: 'transcoding',
  routes: [postRoute('/radarr', radarrValidator, radarrWebhook), postRoute('/sonarr', sonarrValidator, sonarrWebhook)],
})
