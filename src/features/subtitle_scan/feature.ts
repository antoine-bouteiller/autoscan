import { defineFeature } from '@/core/feature'

import { subtitleScanCommand } from './commands/subtitle_scan.command.js'
import { runSubtitleScan } from './jobs/subtitle_scan.job.js'

export const subtitleScanFeature = defineFeature({
  commands: { '/subtitlescan': subtitleScanCommand },
  jobs: [{ handler: runSubtitleScan, name: 'Subtitle Scan', pattern: '0 5 * * *' }],
  name: 'subtitle_scan',
})
