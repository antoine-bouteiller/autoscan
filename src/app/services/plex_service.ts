import ky from 'ky'

import type { PlexMedia, PlexReponse } from '@/types/plex'

import { getLanguage } from '@/app/services/language_service'
import env from '@/config/env'

const plexClient = ky.create({
  headers: {
    'Accept': 'application/json',
    'X-Plex-Token': env.PLEX_TOKEN,
  },
  prefixUrl: env.PLEX_URL,
  throwHttpErrors: false,
})

export async function getMediaDetails(plexMedia: PlexMedia) {
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
    'episode' === plexMedia.type ? 'show' : plexMedia.type
  )

  const part = details.MediaContainer.Metadata[0]?.Media[0]?.Part[0]

  if (!part) {
    throw new Error(`[${mediaTitle}] No part found"`)
  }

  return {
    partsId: part.id,
    tmdbId,
    file,
    mediaTitle,
    originalLanguage,
    streams: part.Stream,
  }
}

export async function getSectionMedia(id: number, sectionType: 'movie' | 'show') {
  const type = 'show' === sectionType ? 4 : 1
  const response = await plexClient<PlexReponse>(`library/sections/${id}/all?type=${type}`).json()

  return response.MediaContainer.Metadata
}

export async function getSections() {
  const response = await plexClient<PlexReponse>(`library/sections`).json()
  return response.MediaContainer.Directory
}

export async function refreshSection(id: number, filePath: string) {
  await plexClient(`library/sections/${id}/refresh`, {
    searchParams: {
      path: filePath,
    },
  })
}

export async function updateStream(
  partsId: number,
  subtitleStreamId: number,
  originalLanguage: string,
  type: 'audio' | 'subtitle'
) {
  await plexClient.put(
    `library/parts/${partsId}?${type}StreamID=${'fra' === originalLanguage ? 0 : subtitleStreamId}`,
    {
      searchParams: { allParts: 1 },
    }
  )
}
