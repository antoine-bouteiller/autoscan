import { cleanupAll } from '@/app/services/downloads/cleanup_service'

export const runCleanupProcess = async () => {
  await cleanupAll()
}
