import { Clock, DateTime, Effect } from 'effect'

import { Plex, Trakt } from '@/core/runtime.service'
import { extractTmdbIdFromPath } from '@/domains/media/services/metadata.service'
import { TraktTokenExpiredError } from '@/features/trakt_sync/errors'
import { getSyncedRatingKeys, getToken, markManyAsSynced, upsertTokens } from '@/features/trakt_sync/repositories/trakt.repository'
import { type IPlexClient } from '@/integrations/plex/plex.service'
import { type PlexMedia } from '@/integrations/plex/plex.validator'
import { type TraktMoviePayload, type TraktShowPayload } from '@/integrations/trakt/trakt.service'

export const getValidAccessToken = Effect.gen(function* () {
  const tokens = yield* getToken
  if (tokens === undefined) {
    return yield* new TraktTokenExpiredError()
  }

  const now = Math.floor((yield* Clock.currentTimeMillis) / 1000)
  if (tokens.expiresAt >= now + 300) {
    return tokens.accessToken
  }

  const traktClient = yield* Trakt
  const result = yield* traktClient.refreshToken(tokens.refreshToken)
  const expiresAt = now + result.expires_in
  yield* upsertTokens(result.access_token, result.refresh_token, expiresAt)
  return result.access_token
})

interface WatchedCollections {
  movies: TraktMoviePayload[]
  ratingKeysToMark: string[]
  showsMap: Map<number, TraktShowPayload>
}

const processMovie = (item: PlexMedia, collections: WatchedCollections, params: { tmdbId: number; watchedAt: string }) => {
  collections.movies.push({ ids: { tmdb: params.tmdbId }, watched_at: params.watchedAt })
  collections.ratingKeysToMark.push(item.ratingKey)
}

const processEpisode = (item: PlexMedia, collections: WatchedCollections, params: { tmdbId: number; watchedAt: string }) => {
  if (item.parentIndex === undefined || item.index === undefined) {
    return
  }
  let show = collections.showsMap.get(params.tmdbId)
  if (show === undefined) {
    show = { ids: { tmdb: params.tmdbId }, seasons: [] }
    collections.showsMap.set(params.tmdbId, show)
  }
  let season = show.seasons.find((entry) => entry.number === item.parentIndex)
  if (season === undefined) {
    season = { episodes: [], number: item.parentIndex }
    show.seasons.push(season)
  }
  season.episodes.push({ number: item.index, watched_at: params.watchedAt })
  collections.ratingKeysToMark.push(item.ratingKey)
}

const processWatchedItem = (item: PlexMedia, collections: WatchedCollections, params: { now: DateTime.Utc; syncedKeys: Set<string> }) => {
  const { now, syncedKeys } = params
  if (syncedKeys.has(item.ratingKey) || (item.viewCount ?? 0) === 0) {
    return
  }
  const filePath = item.Media[0]?.Part[0]?.file
  if (filePath === undefined) {
    return
  }
  const tmdbId = extractTmdbIdFromPath(filePath)
  if (tmdbId === undefined) {
    return
  }
  const watchedAt = DateTime.formatIso(item.lastViewedAt === undefined ? now : DateTime.makeUnsafe(item.lastViewedAt * 1000))
  if (item.type === 'movie') {
    processMovie(item, collections, { tmdbId, watchedAt })
  } else if (item.type === 'episode') {
    processEpisode(item, collections, { tmdbId, watchedAt })
  }
}

export const collectWatchedItems = (plexClient: IPlexClient, syncedKeys: Set<string>) =>
  Effect.gen(function* () {
    const sections = yield* plexClient.getSections
    const now = yield* DateTime.now
    const collections: WatchedCollections = { movies: [], ratingKeysToMark: [], showsMap: new Map() }
    for (const section of sections) {
      const items = yield* plexClient.getSectionMedia(section.key, section.type)
      for (const item of items) {
        processWatchedItem(item, collections, { now, syncedKeys })
      }
    }
    return { movies: collections.movies, ratingKeysToMark: collections.ratingKeysToMark, shows: [...collections.showsMap.values()] }
  })

export const syncPlexToTrakt = Effect.gen(function* () {
  const accessToken = yield* getValidAccessToken
  const plexClient = yield* Plex
  const traktClient = yield* Trakt
  const syncedKeys = yield* getSyncedRatingKeys
  const { movies, ratingKeysToMark, shows } = yield* collectWatchedItems(plexClient, syncedKeys)
  if (movies.length === 0 && shows.length === 0) {
    return { episodes: 0, movies: 0 }
  }
  const result = yield* traktClient.syncWatchedHistory(accessToken, movies, shows)
  yield* markManyAsSynced(ratingKeysToMark)
  return result.added
})
