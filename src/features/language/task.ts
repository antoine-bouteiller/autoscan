import type { PlexClient } from '@/integrations/plex/client'

import { container, TOKENS } from '@/core/bootstrap'
import { getCompleteMediaDetails } from '@/features/metadata/service'
import { tryCatch } from '@/utils/error_handler'

import { handleUpdateLanguage } from './service'

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
