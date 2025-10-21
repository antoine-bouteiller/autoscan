import {
  getTranscodingStatus,
  runTranscodeProcess,
} from '@/app/controllers/commands/transcode_command'
import { logger } from '@/config/logger'

export const transcodeAll = (_request: Request) => {
  if (getTranscodingStatus()) {
    return Response.json({
      message: 'Transcode process is already running',
      status: 'already_running',
    })
  }

  // Lance le processus de transcodage en arrière-plan
  // On garde une référence pour éviter que la Promise soit garbage collectée
  runTranscodeProcess().catch((error) => {
    logger.error({ error }, 'Unhandled error in transcode process')
  })

  // Retourne immédiatement une réponse OK
  return Response.json({ message: 'Transcode process started', status: 'ok' })
}
