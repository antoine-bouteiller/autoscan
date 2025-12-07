import { runCleanupProcess } from '@/features/cleanup'
import { dynDns } from '@/features/dns'
import { updatePlexSelectedLanguages } from '@/features/language'
import { runTranscodeProcess } from '@/features/transcode'
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
