import { runCleanupProcess } from '@/app/controllers/commands/cleanup_command'
import { updatePlexSelectedLanguages } from '@/app/controllers/commands/language_sync_command'
import { runTranscodeProcess } from '@/app/controllers/commands/transcode_command'
import { dynDns } from '@/app/services/infrastructure/ip_service'
import { getSchedulerProvider } from '@/providers/scheduler_provider'

getSchedulerProvider().registerMany([
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
