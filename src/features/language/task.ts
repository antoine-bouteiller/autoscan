import { getCompleteMediaDetails } from '@/features/metadata/service'
import { getSectionMedia, getSections } from '@/integrations/plex/client'
import { tryCatch } from '@/utils/error_handler'

import { handleUpdateLanguage } from './service'

export const updatePlexSelectedLanguages = async () => {
  const sections = await getSections()

  for (const section of sections) {
    const medias = await getSectionMedia(section.key, section.type)
    for (const media of medias) {
      const { mediaTitle, originalLanguage, partsId, streams } =
        await getCompleteMediaDetails(media)

      await tryCatch(handleUpdateLanguage, {
        mediaTitle,
        originalLanguage,
        partsId,
        streams,
      })
    }
  }
}
