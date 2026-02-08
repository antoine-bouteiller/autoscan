import { error, success } from '@/core/response'
import { tryCatch } from '@/utils/error_handler'

import { getTranscodingStatus, runTranscodeProcess } from './task'

export const transcodeAll = (_request: Request) => {
  if (getTranscodingStatus()) {
    return error('ALREADY_RUNNING', 'Transcode process is already running', 409)
  }

  void tryCatch(runTranscodeProcess)

  return success({ message: 'Transcode process started', status: 'ok' })
}
