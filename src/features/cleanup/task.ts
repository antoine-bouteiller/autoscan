import { cleanupAll } from './service'

export const runCleanupProcess = async () => {
  await cleanupAll()
}
