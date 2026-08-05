import { resolve } from 'node:path'

import { Effect } from 'effect'

import { PlexError } from '@/integrations/plex/plex.errors'
import { plexResponseValidator, type PlexMedia } from '@/integrations/plex/plex.validator'
import { type HttpClientError } from '@/shared/types/http_client'
import { httpClient } from '@/shared/utils/http_client'

export type MediaType = 'movie' | 'show'

export interface IPlexClient {
  readonly getBasicMediaInfo: (plexMedia: PlexMedia) => { file: string | undefined; ratingKey: string; type: string }
  readonly getPlexMetadata: (ratingKey: number) => Effect.Effect<PlexMedia, HttpClientError | PlexError>
  readonly getSectionMedia: (id: number, sectionType: MediaType) => Effect.Effect<PlexMedia[], HttpClientError>
  readonly getSections: () => Effect.Effect<{ key: number; title: string; type: MediaType }[], HttpClientError>
  readonly refreshSection: (id: number, filePath: string) => Effect.Effect<void, HttpClientError>
  readonly refreshSections: (filePath: string, mediaType: MediaType) => Effect.Effect<void, HttpClientError>
  readonly updateStream: (partsId: number, streamId: number, type: 'audio' | 'subtitle') => Effect.Effect<void, HttpClientError>
}

interface PlexClientConfig {
  token: string
  url: string
}

export class PlexClient implements IPlexClient {
  private readonly client: ReturnType<typeof httpClient>

  constructor(config: PlexClientConfig) {
    this.client = httpClient({
      baseUrl: config.url,
      headers: { Accept: 'application/json', 'X-Plex-Token': config.token },
      serviceName: 'Plex',
    })
  }

  getPlexMetadata(ratingKey: number) {
    return this.client.get(`library/metadata/${ratingKey}`, { validator: plexResponseValidator }).pipe(
      Effect.flatMap((response) => {
        const metadata = response.MediaContainer.Metadata?.[0]
        return metadata === undefined ? Effect.fail(new PlexError({ ratingKey })) : Effect.succeed(metadata)
      })
    )
  }

  getBasicMediaInfo(plexMedia: PlexMedia) {
    return {
      file: plexMedia.Media[0]?.Part[0]?.file,
      ratingKey: plexMedia.ratingKey,
      type: plexMedia.type === 'episode' ? 'show' : plexMedia.type,
    }
  }

  getSectionMedia(id: number, sectionType: MediaType) {
    const type = sectionType === 'show' ? 4 : 1
    return this.client
      .get(`library/sections/${id}/all`, { params: { type }, validator: plexResponseValidator })
      .pipe(Effect.map((response) => response.MediaContainer.Metadata ?? []))
  }

  getSections() {
    return this.client
      .get('library/sections', { validator: plexResponseValidator })
      .pipe(Effect.map((response) => response.MediaContainer.Directory ?? []))
  }

  refreshSection(id: number, filePath: string) {
    return this.client.get(`library/sections/${id}/refresh`, { params: { path: filePath }, retry: false })
  }

  refreshSections(filePath: string, mediaType: MediaType) {
    const fileDirectory = resolve(filePath, '..')
    return this.getSections().pipe(
      Effect.flatMap((sections) =>
        Effect.forEach(
          sections.filter((section) => section.type === mediaType),
          (section) => this.refreshSection(section.key, fileDirectory),
          {
            concurrency: 'unbounded',
            discard: true,
          }
        )
      )
    )
  }

  updateStream(partsId: number, streamId: number, type: 'audio' | 'subtitle') {
    return this.client.put(`library/parts/${partsId}`, { params: { [`${type}StreamID`]: streamId, allParts: 1 } })
  }
}
