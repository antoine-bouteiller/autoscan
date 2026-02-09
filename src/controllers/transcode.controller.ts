import { error, success } from '@/core/response'
import { getTranscodingStatus, runTranscodeProcess } from '@/jobs/transcode.job'
import { tryCatch } from '@/utils/error_handler'

export const transcodeAll = (_request: Request) => {
  if (getTranscodingStatus()) {
    return error('ALREADY_RUNNING', 'Transcode process is already running', 409)
  }

  void tryCatch(runTranscodeProcess)

  return success({ message: 'Transcode process started', status: 'ok' })
}
