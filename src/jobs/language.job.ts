import type { PlexClient } from '@/integrations/plex.service'

import { container, TOKENS } from '@/core/bootstrap'
import { handleUpdateLanguage } from '@/services/language.service'
import { getCompleteMediaDetails } from '@/services/metadata.service'
import { tryCatch } from '@/utils/error_handler'

export const updatePlexSelectedLanguages = async () => {
  const plexClient = container.resolve<PlexClient>(TOKENS.PLEX_CLIENT)
  const sections = await plexClient.getSections()

  for (const section of sections ?? []) {
    const medias = await plexClient.getSectionMedia(section.key, section.type)
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
