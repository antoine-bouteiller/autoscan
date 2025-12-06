import ky from 'ky'

import type { ISOCode2T } from '@/types/iso_codes'

import env from '@/config/env'

// Types
export type MediaType = 'movie' | 'show'

export interface PlexMedia {
  grandparentTitle?: string
  key: string
  librarySectionID: number
  Media: {
    Part: {
      file: string
      id: number
      Stream: PlexMediaStream[]
    }[]
  }[]
  parentTitle?: string
  primaryExtraKey: string
  ratingKey: string
  title: string
  type: 'episode' | 'movie'
  year: number
}

export interface PlexMediaStream {
  id: number
  languageCode: ISOCode2T
  selected: boolean
  streamType: number
  title?: string
}

export interface PlexReponse {
  MediaContainer: {
    Directory: {
      key: number
      title: string
      type: MediaType
    }[]
    Metadata: PlexMedia[]
  }
}

const plexClient = ky.create({
  headers: {
    Accept: 'application/json',
    'X-Plex-Token': env.PLEX_TOKEN,
  },
  prefixUrl: env.PLEX_URL,
  throwHttpErrors: false,
})

export const getPlexMetadata = async (ratingKey: number) => {
  const response = await plexClient<PlexReponse>(`library/metadata/${ratingKey}`).json()
  return response.MediaContainer.Metadata[0]
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
  const response = await plexClient<PlexReponse>(`library/sections/${id}/all?type=${type}`).json()

  return response.MediaContainer.Metadata
}

export const getSections = async () => {
  const response = await plexClient<PlexReponse>(`library/sections`).json()
  return response.MediaContainer.Directory
}

export const refreshSection = async (id: number, filePath: string) => {
  await plexClient(`library/sections/${id}/refresh`, {
    searchParams: {
      path: filePath,
    },
  })
}

export const updateStream = async (
  partsId: number,
  streamId: number,
  type: 'audio' | 'subtitle'
) => {
  await plexClient.put(`library/parts/${partsId}?${type}StreamID=${streamId}`, {
    searchParams: { allParts: 1 },
  })
}
