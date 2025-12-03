import type { ISOCode1 } from '@/types/iso_codes'

import { tryCatch } from '@/app/exceptions/handler'

import { getTranscodeCommand } from './helpers/get_transcode_command'
import { transcodeQueue } from './helpers/transcode_queue'
import { simpleHash } from './helpers/utils'

export const transcodeFile = async (
  file: string,
  mediaTitle: string,
  originalLanguage: ISOCode1,
  mediaType: 'movie' | 'show'
) => {
  const transcodeComands = await tryCatch(() =>
    getTranscodeCommand(file, mediaTitle, originalLanguage)
  )

  if (transcodeComands) {
    const id = simpleHash(file)
    transcodeQueue.enqueue({
      file,
      id,
      mediaTitle,
      mediaType,
      originalLanguage,
      ...transcodeComands,
    })
    return true
  }
  return false
}
