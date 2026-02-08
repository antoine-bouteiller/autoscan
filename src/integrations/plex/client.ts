import { logError } from '@/utils/error_handler'
import { httpClient } from '@/utils/http_client'

import { type PlexMedia, plexResponseValidator } from './validators'

export type MediaType = 'movie' | 'show'

interface PlexClientConfig {
  token: string
  url: string
}

export class PlexClient {
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

    if (!result.ok) {
      logError(result.error)
      return undefined
    }

    return result.data.MediaContainer.Metadata?.[0]
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

    if (!result.ok) {
      throw result.error
    }

    return result.data.MediaContainer.Metadata
  }

  async getSections() {
    const result = await this.client.get(`library/sections`, {
      validator: plexResponseValidator,
    })

    if (!result.ok) {
      logError(result.error)
      return undefined
    }

    return result.data.MediaContainer.Directory
  }

  async refreshSection(id: number, filePath: string) {
    const result = await this.client.get(`library/sections/${id}/refresh`, {
      params: { path: filePath },
    })

    if (!result.ok) {
      logError(result.error)
    }
  }

  async updateStream(partsId: number, streamId: number, type: 'audio' | 'subtitle') {
    const result = await this.client.put(`library/parts/${partsId}`, {
      params: {
        [`${type}StreamID`]: streamId,
        allParts: 1,
      },
    })

    if (!result.ok) {
      logError(result.error)
    }
  }
}
