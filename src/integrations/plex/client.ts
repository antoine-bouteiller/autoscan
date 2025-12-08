import env from '@/config/env'
import { formatHttpError, handleHttpError } from '@/utils/error_handler'
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
  const result = await plexClient.get(`library/metadata/${ratingKey}`, {
    validator: plexResponseValidator,
  })

  if (!result.ok) {
    handleHttpError(result.error, 'Plex')
    return undefined
  }

  return result.data.MediaContainer.Metadata?.[0]
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
  const result = await plexClient.get(`library/sections/${id}/all`, {
    params: { type },
    validator: plexResponseValidator,
  })

  if (!result.ok) {
    throw new Error(formatHttpError(result.error))
  }

  return result.data.MediaContainer.Metadata
}

export const getSections = async () => {
  const result = await plexClient.get(`library/sections`, {
    validator: plexResponseValidator,
  })

  if (!result.ok) {
    handleHttpError(result.error, 'Plex')
    return undefined
  }

  return result.data.MediaContainer.Directory
}

export const refreshSection = async (id: number, filePath: string) => {
  const result = await plexClient.get(`library/sections/${id}/refresh`, {
    params: { path: filePath },
  })

  if (!result.ok) {
    handleHttpError(result.error, 'Plex')
  }
}

export const updateStream = async (
  partsId: number,
  streamId: number,
  type: 'audio' | 'subtitle'
) => {
  const result = await plexClient.put(`library/parts/${partsId}`, {
    params: {
      [`${type}StreamID`]: streamId,
      allParts: 1,
    },
  })

  if (!result.ok) {
    handleHttpError(result.error, 'Plex')
  }
}
