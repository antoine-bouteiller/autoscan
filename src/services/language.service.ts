import { logger } from '@/config/logger'
import { container, TOKENS } from '@/core/container'
import type { IPlexClient } from '@/integrations/plex.service'
import type { UpdateLanguageParams } from '@/types/language'
import { normalizeToIso1 } from '@/utils/iso_codes'

export const handleUpdateLanguage = async (params: UpdateLanguageParams) => {
  const { mediaTitle, partsId, preferredLanguage, streams } = params

  const audioStream = streams.find((stream) => stream.streamType === 2 && normalizeToIso1(stream.languageCode) === preferredLanguage)

  if (!audioStream) {
    logger.warn(`No ${preferredLanguage} audio stream found`, 'Language', mediaTitle)
    return
  }

  if (!audioStream.selected) {
    logger.info(`Setting audio in ${preferredLanguage}`, 'Language', mediaTitle)

    const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)

    await plexClient.updateStream(partsId, audioStream.id, 'audio')

    if (preferredLanguage === 'fr') {
      await plexClient.updateStream(partsId, 0, 'subtitle')
    }
  }
}
