import { Effect } from 'effect'

import type { PlexMediaStream } from '@/schemas/plex'
import type { ISOCode1 } from '@/types/iso_codes'

import { PlexClient } from '@/integrations/plex.service'
import { normalizeToIso1 } from '@/utils/iso_codes'

interface UpdateLanguageParams {
  mediaTitle: string
  partsId: number
  preferredLanguage: ISOCode1
  streams: readonly PlexMediaStream[]
}

export class LanguageService extends Effect.Service<LanguageService>()('LanguageService', {
  accessors: true,
  dependencies: [PlexClient.Default],
  effect: Effect.gen(function* () {
    const plexClient = yield* PlexClient

    const handleUpdateLanguage = Effect.fn('LanguageService.handleUpdateLanguage')(function* (params: UpdateLanguageParams) {
      const { mediaTitle, partsId, preferredLanguage, streams } = params

      const audioStream = streams.find((stream) => stream.streamType === 2 && normalizeToIso1(stream.languageCode) === preferredLanguage)

      if (!audioStream) {
        yield* Effect.logWarning(`No ${preferredLanguage} audio stream found`).pipe(Effect.annotateLogs({ context: 'Language', media: mediaTitle }))
        return
      }

      if (!audioStream.selected) {
        yield* Effect.logInfo(`Setting audio in ${preferredLanguage}`).pipe(Effect.annotateLogs({ context: 'Language', media: mediaTitle }))

        yield* plexClient.updateStream(partsId, audioStream.id, 'audio')

        if (preferredLanguage === 'fr') {
          yield* plexClient.updateStream(partsId, 0, 'subtitle')
        }
      }
    })

    return {
      handleUpdateLanguage,
    }
  }),
}) {}
