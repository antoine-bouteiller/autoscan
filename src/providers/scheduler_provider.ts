import { Effect, Schedule } from 'effect'

import { PlexClient } from '@/integrations/plex.service'
import { runCleanupProcess } from '@/jobs/cleanup.job'
import { runDynDnsProcess } from '@/jobs/dyndns.job'
import { updatePlexSelectedLanguages } from '@/jobs/language.job'
import { runTranscodeProcess } from '@/jobs/transcode.job'
import { CleanupService } from '@/services/cleanup.service'
import { DnsService } from '@/services/dns.service'
import { LanguageService } from '@/services/language.service'
import { MetadataService } from '@/services/metadata.service'
import { TranscodeService } from '@/services/transcode/transcode.service'

type SchedulerContext = PlexClient | MetadataService | LanguageService | CleanupService | DnsService | TranscodeService

const scheduleJob = (name: string, cron: string, job: Effect.Effect<void, unknown, SchedulerContext>) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Registered cron job: ${name} (${cron})`).pipe(Effect.annotateLogs({ context: 'Scheduler' }))
    yield* Effect.fork(
      Effect.schedule(
        job.pipe(Effect.catchAll((error) => Effect.logError(String(error)).pipe(Effect.annotateLogs({ context: 'Scheduler', job: name })))),
        Schedule.cron(cron, 'Europe/Paris')
      )
    )
  })

export class SchedulerService extends Effect.Service<SchedulerService>()('SchedulerService', {
  dependencies: [
    PlexClient.Default,
    MetadataService.Default,
    LanguageService.Default,
    CleanupService.Default,
    DnsService.Default,
    TranscodeService.Default,
  ],
  effect: Effect.gen(function* () {
    yield* scheduleJob('Cleanup', '0 */10 * * * *', runCleanupProcess)
    yield* scheduleJob('Language Sync', '0 0 */12 * * *', updatePlexSelectedLanguages)
    yield* scheduleJob('Transcode', '0 0 */12 * * *', runTranscodeProcess)
    yield* scheduleJob('Dynamic DNS', '0 */5 * * * *', runDynDnsProcess)

    return {}
  }),
}) {}
