import { cleanupAll } from '@/app/services/infrastructure/cleanup_service'

export const runCleanupProcess = async () => {
  await cleanupAll()
}
