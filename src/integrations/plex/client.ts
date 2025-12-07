import env from '@/config/env'
import { httpClient } from '@/utils/http_client'

import { type PlexMedia, plexResponseValidator } from './validators'

// Types
export type MediaType = 'movie' | 'show'

const plexClient = httpClient({
  baseUrl: env.PLEX_URL,
  headers: {
    Accept: 'application/json',
    'X-Plex-Token': env.PLEX_TOKEN,
  },
})

export const getPlexMetadata = async (ratingKey: number) => {
  const response = await plexClient.get(`library/metadata/${ratingKey}`, {
    validator: plexResponseValidator,
  })
  return response.MediaContainer.Metadata?.[0]
}

export const getBasicMediaInfo = (plexMedia: PlexMedia) => {
  const file = plexMedia.Media[0]?.Part[0]?.file
  const type = plexMedia.type === 'episode' ? 'show' : plexMedia.type

  return {
    file,
    ratingKey: plexMedia.ratingKey,
    type,
  }
}

export const getSectionMedia = async (id: number, sectionType: 'movie' | 'show') => {
  const type = sectionType === 'show' ? 4 : 1
  const response = await plexClient.get(`library/sections/${id}/all`, {
    params: { type },
    validator: plexResponseValidator,
  })

  return response.MediaContainer.Metadata
}

export const getSections = async () => {
  const response = await plexClient.get(`library/sections`, {
    validator: plexResponseValidator,
  })
  return response.MediaContainer.Directory
}

export const refreshSection = async (id: number, filePath: string) => {
  await plexClient.get(`library/sections/${id}/refresh`, {
    params: { path: filePath },
  })
}

export const updateStream = async (
  partsId: number,
  streamId: number,
  type: 'audio' | 'subtitle'
) => {
  await plexClient.put(`library/parts/${partsId}`, {
    params: {
      [`${type}StreamID`]: streamId,
      allParts: 1,
    },
  })
}
