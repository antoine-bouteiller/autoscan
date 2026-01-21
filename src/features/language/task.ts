import { getCompleteMediaDetails } from '@/features/metadata'
import { getSectionMedia, getSections } from '@/integrations/plex'
import { tryCatch } from '@/utils/error_handler'

import { handleUpdateLanguage } from './service'

export const updatePlexSelectedLanguages = async () => {
  const sections = await getSections()

  for (const section of sections ?? []) {
    const medias = await getSectionMedia(section.key, section.type)
    for (const media of medias ?? []) {
      const { mediaTitle, partsId, preferredLanguage, streams } = await getCompleteMediaDetails(media)

      await tryCatch(handleUpdateLanguage, {
        mediaTitle,
        partsId,
        preferredLanguage,
        streams,
      })
    }
  }
}
