import { tryCatch } from '@/utils/error_handler'

import { getTranscodingStatus, runTranscodeProcess } from './task'

export const transcodeAll = (_request: Request) => {
  if (getTranscodingStatus()) {
    return Response.json({
      message: 'Transcode process is already running',
      status: 'already_running',
    })
  }

  tryCatch(runTranscodeProcess)

  return Response.json({ message: 'Transcode process started', status: 'ok' })
}
