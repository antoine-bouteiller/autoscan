import ky from 'ky'

import type { PlexMedia, PlexReponse } from '@/types/plex'

import env from '@/config/env'
import { getLanguage } from '@/app/services/media/language_service'

const plexClient = ky.create({
  headers: {
    'Accept': 'application/json',
    'X-Plex-Token': env.PLEX_TOKEN,
  },
  prefixUrl: env.PLEX_URL,
  throwHttpErrors: false,
})

export const getMediaDetails = async (plexMedia: PlexMedia) => {
  const mediaTitle = [plexMedia.grandparentTitle, plexMedia.parentTitle, plexMedia.title]
    .filter(Boolean)
    .join(' - ')

  const file = plexMedia.Media[0]?.Part[0]?.file

  if (!file) {
    throw new Error(`[${mediaTitle}] No file found"`)
  }

  const details = await plexClient<PlexReponse>(`library/metadata/${plexMedia.ratingKey}`).json()

  const tmdbId = Number(/{tmdb-(.*?)}/g.exec(file)?.[1])

  if (!tmdbId) {
    throw new Error(`[${mediaTitle}] No tmdbId found"`)
  }

  const originalLanguage = await getLanguage(
    tmdbId,
    plexMedia.type === 'episode' ? 'show' : plexMedia.type
  )

  const part = details.MediaContainer.Metadata[0]?.Media[0]?.Part[0]

  if (!part) {
    throw new Error(`[${mediaTitle}] No part found"`)
  }

  return {
    file,
    mediaTitle,
    originalLanguage,
    partsId: part.id,
    streams: part.Stream,
    tmdbId,
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

interface UpdateStreamParams {
  partsId: number
  subtitleStreamId: number
  originalLanguage: string
  type: 'audio' | 'subtitle'
}

export const updateStream = async (params: UpdateStreamParams) => {
  const { partsId, subtitleStreamId, originalLanguage, type } = params
  await plexClient.put(
    `library/parts/${partsId}?${type}StreamID=${originalLanguage === 'fra' ? 0 : subtitleStreamId}`,
    {
      searchParams: { allParts: 1 },
    }
  )
}
