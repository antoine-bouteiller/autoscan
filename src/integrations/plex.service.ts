import { FetchHttpClient, HttpClient } from '@effect/platform'
import { Effect, Redacted } from 'effect'

import { AppConfig } from '@/config/app_config'
import { makeHttpClient } from '@/config/http_client'
import { PlexResponse, type PlexMedia } from '@/schemas/plex'

export type MediaType = 'movie' | 'show'

export class PlexClient extends Effect.Service<PlexClient>()('PlexClient', {
  accessors: true,
  dependencies: [AppConfig.Default, FetchHttpClient.layer],
  effect: Effect.gen(function* () {
    const config = yield* AppConfig
    const client = yield* HttpClient.HttpClient

    const api = makeHttpClient(client, config.PLEX_URL, {
      Accept: 'application/json',
      'X-Plex-Token': Redacted.value(config.PLEX_TOKEN),
    })

    const getPlexMetadata = Effect.fn('PlexClient.getPlexMetadata')((ratingKey: number) =>
      api.get(`library/metadata/${ratingKey}`, PlexResponse).pipe(
        Effect.map((data) => data.MediaContainer.Metadata?.[0]),
        Effect.catchAll(() => Effect.void)
      )
    )

    const getSectionMedia = Effect.fn('PlexClient.getSectionMedia')((id: number, sectionType: MediaType) => {
      const type = sectionType === 'show' ? 4 : 1
      return api.get(`library/sections/${id}/all`, PlexResponse, { type: String(type) }).pipe(
        Effect.map((data) => data.MediaContainer.Metadata ?? []),
        Effect.catchAll(() => Effect.succeed([] as PlexMedia[]))
      )
    })

    const getSections = Effect.fn('PlexClient.getSections')(() =>
      api.get('library/sections', PlexResponse).pipe(
        Effect.map((data) => data.MediaContainer.Directory ?? []),
        Effect.catchAll((error) =>
          Effect.logError(`(Plex) ${String(error)}`).pipe(Effect.as([] as { key: number; title: string; type: MediaType }[]))
        )
      )
    )

    const refreshSection = Effect.fn('PlexClient.refreshSection')((id: number, filePath: string) =>
      api
        .getVoid(`library/sections/${id}/refresh`, { path: filePath })
        .pipe(Effect.catchAll((error) => Effect.logError(`(Plex) ${String(error)}`).pipe(Effect.asVoid)))
    )

    const updateStream = Effect.fn('PlexClient.updateStream')((partsId: number, streamId: number, type: 'audio' | 'subtitle') =>
      api
        .put(`library/parts/${partsId}`, { [`${type}StreamID`]: String(streamId), allParts: '1' })
        .pipe(Effect.catchAll((error) => Effect.logError(`(Plex) ${String(error)}`).pipe(Effect.asVoid)))
    )

    return {
      getBasicMediaInfo: (plexMedia: PlexMedia) => ({
        file: plexMedia.Media[0]?.Part[0]?.file,
        ratingKey: plexMedia.ratingKey,
        type: plexMedia.type === 'episode' ? 'show' : plexMedia.type,
      }),
      getPlexMetadata,
      getSectionMedia,
      getSections,
      refreshSection,
      updateStream,
    }
  }),
}) {}
