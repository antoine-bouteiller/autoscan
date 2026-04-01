import { container, TOKENS } from '#core/container'
import { runCleanupProcess } from '#jobs/cleanup.job'
import { updatePlexSelectedLanguages } from '#jobs/language.job'
import { traktSyncJob } from '#jobs/trakt.job'
import { runTranscodeProcess } from '#jobs/transcode.job'
import { type SchedulerProvider } from '#providers/scheduler_provider'
import { dynDns } from '#services/dns.service'

container.resolve<SchedulerProvider>(TOKENS.SCHEDULER_PROVIDER).registerMany([
  {
    handler: runCleanupProcess,
    name: 'Cleanup',
    pattern: '0 */10 * * * *',
  },
  {
    handler: updatePlexSelectedLanguages,
    name: 'Language Sync',
    pattern: '0 0 */12 * * *',
  },
  {
    handler: traktSyncJob,
    name: 'Trakt Sync',
    pattern: '0 0 */12 * * *',
  },
  {
    handler: runTranscodeProcess,
    name: 'Transcode',
    pattern: '0 0 */12 * * *',
  },
  {
    handler: dynDns,
    name: 'Dynamic DNS',
    pattern: '0 */5 * * * *',
  },
])
