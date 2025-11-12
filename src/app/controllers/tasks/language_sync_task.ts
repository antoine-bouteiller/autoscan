import { tryCatch } from '@/app/exceptions/handler'
import { getSectionMedia, getSections } from '@/app/integrations/plex/plex_client'
import { handleUpdateLanguage } from '@/app/services/media/language_service'
import { getCompleteMediaDetails } from '@/app/services/media/metadata_service'

export const updatePlexSelectedLanguages = async () => {
  const sections = await getSections()

  for (const section of sections) {
    const medias = await getSectionMedia(section.key, section.type)
    for (const media of medias) {
      const { partsId, mediaTitle, originalLanguage, streams } =
        await getCompleteMediaDetails(media)

      await tryCatch(handleUpdateLanguage, { mediaTitle, originalLanguage, partsId, streams })
    }
  }
}
