import type { ITmdbClient } from '@/integrations/tmdb.service'
import type { TmdbMedia, TmdbMovie, TmdbTV } from '@/validators/tmdb.validator'

export class MockTmdbClient implements ITmdbClient {
  mediaMap = new Map<string, TmdbMedia>()
  callCount = 0

  async getTmdbMedia(tmdbId: number, mediaType: 'movie' | 'show'): Promise<TmdbMedia> {
    this.callCount++
    const key = `${tmdbId}-${mediaType}`
    return this.mediaMap.get(key) ?? { data: undefined, type: 'movie' }
  }

  async getTmdbMovie(_tmdbId: number): Promise<TmdbMovie | undefined> {
    return undefined
  }

  async getTmdbTvShow(_tmdbId: number): Promise<TmdbTV | undefined> {
    return undefined
  }

  reset() {
    this.mediaMap.clear()
    this.callCount = 0
  }
}
