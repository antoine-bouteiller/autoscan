import { container, TOKENS } from '#core/container'
import { handleUpdateLanguage } from '#features/language-sync/services/language.service'
import { type IPlexClient } from '#integrations/plex/plex.service'
import { getCompleteMediaDetails } from '#media/metadata.service'
import { isError, logError } from '#shared/utils/error'

export const updatePlexSelectedLanguages = async () => {
  const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)
  const sections = await plexClient.getSections()

  for (const section of sections ?? []) {
    const medias = await plexClient.getSectionMedia(section.key, section.type)
    for (const media of medias ?? []) {
      const details = await getCompleteMediaDetails(Number(media.ratingKey))

      if (isError(details)) {
        logError(details, 'updatePlexSelectedLanguages')
        continue
      }

      const { mediaTitle, partsId, preferredLanguage, streams } = details

      await handleUpdateLanguage({ mediaTitle, partsId, preferredLanguage, streams })
    }
  }
}
