import { tryCatch } from '@/app/exceptions/handler'
import type { iso2 } from '@/types/iso_codes'
import { getTranscodeCommand } from './helpers/get_transcode_command'
import { transcodeQueue } from './helpers/transcode_queue'

export const transcodeFile = async (
  file: string,
  mediaTitle: string,
  originalLanguage: iso2,
  mediaType: 'movie' | 'show'
) => {
  const command = await tryCatch(() => getTranscodeCommand(file, mediaTitle, originalLanguage))

  if (command) {
    transcodeQueue.enqueue({
      command,
      file: file,
      mediaTitle: mediaTitle,
      mediaType: mediaType,
      originalLanguage: originalLanguage,
    })
    return true
  }
  return false
}
