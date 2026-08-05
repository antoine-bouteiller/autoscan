import { Effect } from 'effect'

import { type ITmdbClient } from '@/integrations/tmdb/tmdb.service'
import { type TmdbMedia } from '@/integrations/tmdb/tmdb.validator'
import { NetworkError } from '@/shared/errors/network'

const missing = () => new NetworkError({ originalMessage: 'TMDB fixture missing', serviceName: 'TmdbTest' })

export class MockTmdbClient implements ITmdbClient {
  mediaMap = new Map<string, TmdbMedia>()
  callCount = 0

  getTmdbMedia(tmdbId: number, mediaType: 'movie' | 'show') {
    this.callCount++
    const media = this.mediaMap.get(`${tmdbId}-${mediaType}`)
    return media === undefined ? Effect.fail(missing()) : Effect.succeed(media)
  }

  getTmdbMovie() {
    return Effect.fail(missing())
  }

  getTmdbTvShow() {
    return Effect.fail(missing())
  }

  reset() {
    this.mediaMap.clear()
    this.callCount = 0
  }
}
