import { cleanupAll } from '#features/queue-cleanup/services/cleanup.service'

export const runCleanupProcess = async () => {
  await cleanupAll()
}
