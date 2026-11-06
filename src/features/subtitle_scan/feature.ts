import { defineFeature } from '@/core/feature'

import { deleteSubtitleAction, invalidSubtitlesCommand } from './commands/invalid_subtitles.command.js'
import { subtitleScanCommand } from './commands/subtitle_scan.command.js'
import { DELETE_SUBTITLE_ACTION } from './constants.js'
import { runSubtitleScan } from './jobs/subtitle_scan.job.js'

export const subtitleScanFeature = defineFeature({
  actions: { [DELETE_SUBTITLE_ACTION]: deleteSubtitleAction },
  commands: { '/invalidsubtitles': invalidSubtitlesCommand, '/subtitlescan': subtitleScanCommand },
  jobs: [{ handler: runSubtitleScan, name: 'Subtitle Scan', pattern: '0 5 * * *' }],
  name: 'subtitle_scan',
})
