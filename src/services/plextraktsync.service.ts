import { container, TOKENS } from '#core/container'
import { TraktTokenExpiredError } from '#errors/trakt'
import { type IPlexClient } from '#integrations/plex.service'
import { type ITraktClient, type TraktMoviePayload, type TraktShowPayload } from '#integrations/trakt.service'
import { getSyncedRatingKeys, getToken, markManyAsSynced, upsertTokens } from '#repositories/trakt.repository'
import { extractTmdbIdFromPath } from '#services/metadata.service'
import { isError, logError } from '#utils/error'
import { type PlexMedia } from '#validators/plex.validator'

export const getValidAccessToken = async () => {
  const tokens = await getToken()
  if (!tokens) {
    return new TraktTokenExpiredError()
  }

  const now = Math.floor(Date.now() / 1000)

  if (tokens.expiresAt < now + 300) {
    const traktClient = container.resolve<ITraktClient>(TOKENS.TRAKT_CLIENT)
    const result = await traktClient.refreshToken(tokens.refreshToken)

    if (isError(result)) {
      logError(result, 'Trakt token refresh failed')
      return result
    }

    const expiresAt = Math.floor(Date.now() / 1000) + result.expires_in
    await upsertTokens(result.access_token, result.refresh_token, expiresAt)
    return result.access_token
  }

  return tokens.accessToken
}

interface WatchedCollections {
  movies: TraktMoviePayload[]
  ratingKeysToMark: string[]
  showsMap: Map<number, TraktShowPayload>
}

const processMovie = (item: PlexMedia, tmdbId: number, watchedAt: string, collections: WatchedCollections) => {
  collections.movies.push({ ids: { tmdb: tmdbId }, watched_at: watchedAt })
  collections.ratingKeysToMark.push(item.ratingKey)
}

const processEpisode = (item: PlexMedia, tmdbId: number, watchedAt: string, collections: WatchedCollections) => {
  if (item.parentIndex === undefined || item.index === undefined) {
    return
  }

  let show = collections.showsMap.get(tmdbId)
  if (!show) {
    show = { ids: { tmdb: tmdbId }, seasons: [] }
    collections.showsMap.set(tmdbId, show)
  }

  let season = show.seasons.find((s) => s.number === item.parentIndex)
  if (!season) {
    season = { episodes: [], number: item.parentIndex }
    show.seasons.push(season)
  }

  season.episodes.push({ number: item.index, watched_at: watchedAt })
  collections.ratingKeysToMark.push(item.ratingKey)
}

const processWatchedItem = (item: PlexMedia, collections: WatchedCollections, syncedKeys: Set<string>) => {
  if (syncedKeys.has(item.ratingKey) || !item.viewCount) {
    return
  }

  const filePath = item.Media[0]?.Part[0]?.file
  if (!filePath) {
    return
  }

  const tmdbId = extractTmdbIdFromPath(filePath)
  if (!tmdbId) {
    return
  }

  const watchedAt = item.lastViewedAt ? new Date(item.lastViewedAt * 1000).toISOString() : new Date().toISOString()

  if (item.type === 'movie') {
    processMovie(item, tmdbId, watchedAt, collections)
  } else if (item.type === 'episode') {
    processEpisode(item, tmdbId, watchedAt, collections)
  }
}

export const collectWatchedItems = async (plexClient: IPlexClient, syncedKeys: Set<string>) => {
  const sections = await plexClient.getSections()
  const collections: WatchedCollections = {
    movies: [],
    ratingKeysToMark: [],
    showsMap: new Map<number, TraktShowPayload>(),
  }

  for (const section of sections) {
    const items = await plexClient.getSectionMedia(section.key, section.type)
    for (const item of items) {
      processWatchedItem(item, collections, syncedKeys)
    }
  }

  return {
    movies: collections.movies,
    ratingKeysToMark: collections.ratingKeysToMark,
    shows: [...collections.showsMap.values()],
  }
}

export const syncPlexToTrakt = async () => {
  const accessToken = await getValidAccessToken()
  if (isError(accessToken)) {
    return accessToken
  }

  const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)
  const traktClient = container.resolve<ITraktClient>(TOKENS.TRAKT_CLIENT)

  const syncedKeys = await getSyncedRatingKeys()
  const { movies, ratingKeysToMark, shows } = await collectWatchedItems(plexClient, syncedKeys)

  if (movies.length === 0 && shows.length === 0) {
    return { episodes: 0, movies: 0 }
  }

  const result = await traktClient.syncWatchedHistory(accessToken, movies, shows)

  if (isError(result)) {
    return result
  }

  await markManyAsSynced(ratingKeysToMark)

  return result.added
}
