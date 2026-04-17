import { resolve } from 'node:path'

import { PlexError } from '#integrations/plex/plex.errors'
import { plexResponseValidator, type PlexMedia } from '#integrations/plex/plex.validator'
import { type HttpError } from '#shared/errors/http'
import { type NetworkError } from '#shared/errors/network'
import { type ValidationError } from '#shared/errors/validation'
import { isError, logError } from '#shared/utils/error'
import { httpClient } from '#shared/utils/http_client'

export type MediaType = 'movie' | 'show'

export interface IPlexClient {
  getPlexMetadata(ratingKey: number): Promise<PlexMedia | HttpError | NetworkError | ValidationError | PlexError>
  getBasicMediaInfo(plexMedia: PlexMedia): { file: string | undefined; ratingKey: string; type: string }
  getSectionMedia(id: number, sectionType: 'movie' | 'show'): Promise<PlexMedia[]>
  getSections(): Promise<{ key: number; title: string; type: 'movie' | 'show' }[]>
  refreshSection(id: number, filePath: string): Promise<void>
  refreshSections(filePath: string, mediaType: MediaType): Promise<void>
  updateStream(partsId: number, streamId: number, type: 'audio' | 'subtitle'): Promise<void>
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
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': config.token,
      },
      serviceName: 'Plex',
    })
  }

  async getPlexMetadata(ratingKey: number) {
    const result = await this.client.get(`library/metadata/${ratingKey}`, {
      validator: plexResponseValidator,
    })

    if (isError(result)) {
      return result
    }

    const metadata = result.MediaContainer.Metadata?.[0]

    if (!metadata) {
      return new PlexError({ ratingKey })
    }

    return metadata
  }

  getBasicMediaInfo(plexMedia: PlexMedia) {
    const file = plexMedia.Media[0]?.Part[0]?.file
    const type = plexMedia.type === 'episode' ? 'show' : plexMedia.type

    return {
      file,
      ratingKey: plexMedia.ratingKey,
      type,
    }
  }

  async getSectionMedia(id: number, sectionType: 'movie' | 'show') {
    const type = sectionType === 'show' ? 4 : 1
    const result = await this.client.get(`library/sections/${id}/all`, {
      params: { type },
      validator: plexResponseValidator,
    })

    if (isError(result)) {
      logError(result)
      return []
    }

    return result.MediaContainer.Metadata ?? []
  }

  async getSections() {
    const result = await this.client.get(`library/sections`, {
      validator: plexResponseValidator,
    })

    if (isError(result)) {
      logError(result)
      return []
    }

    return result.MediaContainer.Directory ?? []
  }

  async refreshSection(id: number, filePath: string) {
    const result = await this.client.get(`library/sections/${id}/refresh`, {
      params: { path: filePath },
    })

    if (isError(result)) {
      logError(result)
    }
  }

  async refreshSections(filePath: string, mediaType: MediaType) {
    const sections = await this.getSections()
    const fileDirectory = resolve(filePath, '..')

    await Promise.all(sections.filter((section) => section.type === mediaType).map((section) => this.refreshSection(section.key, fileDirectory)))
  }

  async updateStream(partsId: number, streamId: number, type: 'audio' | 'subtitle') {
    const result = await this.client.put(`library/parts/${partsId}`, {
      params: {
        [`${type}StreamID`]: streamId,
        allParts: 1,
      },
    })

    if (isError(result)) {
      logError(result)
    }
  }
}
