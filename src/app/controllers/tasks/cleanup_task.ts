import { cleanupAll } from '@/app/services/media/cleanup_service'

export const runCleanupProcess = async () => {
  await cleanupAll()
}
