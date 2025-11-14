import { runCleanupProcess } from '@/app/controllers/tasks/cleanup_task'
import { dynDns } from '@/app/controllers/tasks/dyn_dns_task'
import { updatePlexSelectedLanguages } from '@/app/controllers/tasks/language_sync_task'
import { runTranscodeProcess } from '@/app/controllers/tasks/transcode_task'
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
