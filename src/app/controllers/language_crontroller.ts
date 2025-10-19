import { tryCatch } from '@/app/exceptions/handler'
import { handleUpdateLanguage } from '@/app/services/language_service'
import { getMediaDetails, getSectionMedia, getSections } from '@/app/services/plex_service'
import { logger } from '@/config/logger'

export async function updatePlexSelectedLanguages() {
  const sections = await getSections()

  await Promise.all(
    sections.map(async (section) => {
      const medias = await getSectionMedia(section.key, section.type)
      await Promise.all(
        medias.map(async (media) => {
          const { partsId, mediaTitle, originalLanguage, streams } = await getMediaDetails(media)

          if (!streams.filter((stream) => 2 === stream.streamType).length) {
            logger.error(`[${mediaTitle}] No audio streams found: ${JSON.stringify(media)}`)
            return
          }

          if (!streams.filter((stream) => 1 === stream.streamType).length) {
            logger.error(`[${mediaTitle}] No video streams found: ${JSON.stringify(media)}`)
            return
          }

          await tryCatch(async () =>
            handleUpdateLanguage(mediaTitle, streams, originalLanguage, partsId)
          )
        })
      )
    })
  )
}
