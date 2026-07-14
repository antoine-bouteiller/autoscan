import { cleanupAll } from '@/features/queue_cleanup/services/cleanup.service'

export const runCleanupProcess = async () => {
  await cleanupAll()
}
