import { tryCatch } from '@/app/exceptions/handler'
import {
  getMediaDetails,
  getSectionMedia,
  getSections,
} from '@/app/services/integrations/plex_service'
import { handleUpdateLanguage } from '@/app/services/media/language_service'

export const updatePlexSelectedLanguages = async () => {
  const sections = await getSections()

  for (const section of sections) {
    const medias = await getSectionMedia(section.key, section.type)
    for (const media of medias) {
      const { partsId, mediaTitle, originalLanguage, streams } = await getMediaDetails(media)

      await tryCatch(handleUpdateLanguage, { mediaTitle, originalLanguage, partsId, streams })
    }
  }
}
