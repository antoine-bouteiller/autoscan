import { Cause, Effect } from 'effect'

import { Plex } from '@/core/runtime.service'
import { getCompleteMediaDetails } from '@/domains/media/services/metadata.service'
import { handleUpdateLanguage } from '@/features/language_sync/services/language.service'

export const updatePlexSelectedLanguages = Effect.gen(function* () {
  const plexClient = yield* Plex
  const sections = yield* plexClient.getSections

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
                Effect.catchCauseIf(
                  (cause) => !Cause.hasInterruptsOnly(cause),
                  (cause) => Effect.logError(cause, 'updatePlexSelectedLanguages')
                )
              ),
            { discard: true }
          )
        )
      ),
    { discard: true }
  )
})
