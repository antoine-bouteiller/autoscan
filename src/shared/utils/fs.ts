import { existsSync, readFileSync } from 'node:fs'

import { FileAccessError } from '@/features/transcoding/errors'

// Ponytail: sync reads only; move to FileSystem once env loading and subtitle parsing run inside the Effect runtime
export const safeReadFileSync = (filePath: string): string | FileAccessError => {
  try {
    return readFileSync(filePath, 'utf8')
  } catch (error) {
    return new FileAccessError({ cause: error, filePath, operation: 'read' })
  }
}
