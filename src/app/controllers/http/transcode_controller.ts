import { getTranscodingStatus, runTranscodeProcess } from '@/app/controllers/tasks/transcode_task'
import { tryCatch } from '@/app/exceptions/handler'

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
