import { resolve } from 'node:path'

import type { FastifyReply, FastifyRequest } from 'fastify'

import { tryCatch } from '@/app/exceptions/handler'
import {
  getMediaDetails,
  getSectionMedia,
  getSections,
  refreshSection,
} from '@/app/services/plex_service'
import { TranscodeService } from '@/app/services/transcode_service'
import { logger } from '@/config/logger'

let isTranscoding = false

export const runTranscodeProcess = async () => {
  if (isTranscoding) {
    logger.warn('Transcode process is already running, skipping...')
    return
  }

  isTranscoding = true
  try {
    logger.info('Starting transcode process...')
    const sections = await getSections()

    for (const section of sections) {
      const medias = (await tryCatch(getSectionMedia, section.key, section.type)) ?? []

      for (const media of medias) {
        const details = await tryCatch(getMediaDetails, media)

        if (!details) {
          continue
        }

        const transcodeService = new TranscodeService(
          details.file,
          details.mediaTitle,
          details.originalLanguage
        )

        const executedTranscode = await tryCatch(() => transcodeService.transcodeFile())

        if (executedTranscode) {
          await refreshSection(section.key, resolve(details.file, '..'))
        }
      }
    }

    logger.info('Transcoding finished')
  } catch (error) {
    logger.error({ error }, 'Error during transcode process')
  } finally {
    isTranscoding = false
  }
}

export const transcodeAll = (_request: FastifyRequest, reply: FastifyReply) => {
  if (isTranscoding) {
    return reply.status(409).send({
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
  return reply.status(200).send({ message: 'Transcode process started', status: 'ok' })
}
