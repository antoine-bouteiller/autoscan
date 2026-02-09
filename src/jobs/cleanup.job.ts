import { cleanupAll } from '@/services/cleanup.service'

export const runCleanupProcess = async () => {
  await cleanupAll()
}
