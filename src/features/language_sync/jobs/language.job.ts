import { Effect } from 'effect'

import { Plex } from '@/core/runtime.service'
import { getCompleteMediaDetails } from '@/domains/media/services/metadata.service'
import { handleUpdateLanguage } from '@/features/language_sync/services/language.service'
import { logError } from '@/shared/utils/error'

export const updatePlexSelectedLanguages = Effect.gen(function* () {
  const plexClient = yield* Plex
  const sections = yield* plexClient.getSections()

  yield* Effect.forEach(
    sections,
    (section) =>
      plexClient.getSectionMedia(section.key, section.type).pipe(
        Effect.flatMap((medias) =>
          Effect.forEach(
            medias,
            (media) =>
              getCompleteMediaDetails(Number(media.ratingKey)).pipe(
                Effect.flatMap((details) => handleUpdateLanguage(details)),
                Effect.catch((error) => Effect.sync(() => logError(error, 'updatePlexSelectedLanguages')))
              ),
            { discard: true }
          )
        )
      ),
    { discard: true }
  )
})
