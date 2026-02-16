import { Effect } from 'effect'

import { LanguageService } from '@/services/language.service'
import { MetadataService } from '@/services/metadata.service'

export const updatePlexSelectedLanguages = Effect.gen(function* () {
  const metadataService = yield* MetadataService
  const languageService = yield* LanguageService

  yield* metadataService.forEachMedia((details) =>
    languageService.handleUpdateLanguage({
      mediaTitle: details.mediaTitle,
      partsId: details.partsId,
      preferredLanguage: details.preferredLanguage,
      streams: details.streams,
    })
  )
})
