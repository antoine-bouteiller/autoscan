import { type ITmdbClient } from '@/integrations/tmdb/tmdb.service'
import { type TmdbMedia } from '@/integrations/tmdb/tmdb.validator'

export class MockTmdbClient implements ITmdbClient {
  mediaMap = new Map<string, TmdbMedia>()
  callCount = 0

  async getTmdbMedia(tmdbId: number, mediaType: 'movie' | 'show') {
    this.callCount++
    const key = `${tmdbId}-${mediaType}`
    return this.mediaMap.get(key) ?? { data: undefined, type: 'movie' }
  }

  async getTmdbMovie() {
    return undefined
  }

  async getTmdbTvShow() {
    return undefined
  }

  reset() {
    this.mediaMap.clear()
    this.callCount = 0
  }
}
