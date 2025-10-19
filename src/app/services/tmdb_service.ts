import ky from 'ky'

import type { MediaType } from '@/types/plex'
import type { TmdbResponse } from '@/types/tmdb'

import { createdOrUpdatedMedia } from '@/app/services/media_service'
import env from '@/config/env'
import { countryISOMapping, type iso2 } from '@/types/iso_codes'

const tmdbClient = ky.create({
  headers: {
    Authorization: `Bearer ${env.TMDB_API_TOKEN}`,
  },
  prefixUrl: env.TMDB_API_URL,
  throwHttpErrors: false,
})

export async function getLanguageByIdAndType(tmdbId: number, type: MediaType): Promise<iso2> {
  switch (type) {
    case 'movie':
      return getMovieLanguageById(tmdbId)
    case 'show':
      return getSeriesLanguageById(tmdbId)
    default:
      throw new Error('Invalid type')
  }
}

async function getMovieLanguageById(tmdbId: number): Promise<iso2> {
  const response = await tmdbClient<TmdbResponse>(`movie/${tmdbId}`)

  if (!response.ok) {
    return 'eng'
  }

  const data = await response.json()

  const language = countryISOMapping[data.original_language]

  await createdOrUpdatedMedia(tmdbId, 'movie', data.title, language)

  return language
}

async function getSeriesLanguageById(tmdbId: number): Promise<iso2> {
  const response = await tmdbClient<TmdbResponse>(`tv/${tmdbId}`)

  if (!response.ok) {
    return 'eng'
  }

  const data = await response.json()

  const language = countryISOMapping[data.original_language]

  await createdOrUpdatedMedia(tmdbId, 'show', data.name, language)

  return language
}
