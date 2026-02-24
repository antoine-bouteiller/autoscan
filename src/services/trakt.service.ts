import { container, TOKENS } from '@/core/container'
import { TraktTokenExpiredError } from '@/errors/trakt'
import { type IPlexClient } from '@/integrations/plex.service'
import { type ITraktClient, type TraktMoviePayload, type TraktShowPayload } from '@/integrations/trakt.service'
import { getSyncedRatingKeys, getTokens, markManyAsSynced, upsertTokens } from '@/repositories/trakt.repository'
import { extractTmdbIdFromPath } from '@/services/metadata.service'
import { isError, logError } from '@/utils/error'

const getValidAccessToken = async () => {
  const tokens = await getTokens()
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

export const syncPlexToTrakt = async () => {
  const accessToken = await getValidAccessToken()
  if (isError(accessToken)) {
    return accessToken
  }

  const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)
  const traktClient = container.resolve<ITraktClient>(TOKENS.TRAKT_CLIENT)

  const syncedKeys = await getSyncedRatingKeys()
  const sections = await plexClient.getSections()

  const movies: TraktMoviePayload[] = []
  const showsMap = new Map<number, TraktShowPayload>()
  const ratingKeysToMark: string[] = []

  for (const section of sections) {
    const items = await plexClient.getSectionMedia(section.key, section.type)

    for (const item of items) {
      if (syncedKeys.has(item.ratingKey)) {
        continue
      }

      if (!item.viewCount || item.viewCount === 0) {
        continue
      }

      const filePath = item.Media[0]?.Part[0]?.file
      if (!filePath) {
        continue
      }

      const tmdbId = extractTmdbIdFromPath(filePath)
      if (!tmdbId) {
        continue
      }

      const watchedAt = item.lastViewedAt ? new Date(item.lastViewedAt * 1000).toISOString() : new Date().toISOString()

      if (item.type === 'movie') {
        movies.push({ ids: { tmdb: tmdbId }, watched_at: watchedAt })
        ratingKeysToMark.push(item.ratingKey)
      } else if (item.type === 'episode' && item.parentIndex !== undefined && item.index !== undefined) {
        let show = showsMap.get(tmdbId)
        if (!show) {
          show = { ids: { tmdb: tmdbId }, seasons: [] }
          showsMap.set(tmdbId, show)
        }

        let season = show.seasons.find((s) => s.number === item.parentIndex)
        if (!season) {
          season = { episodes: [], number: item.parentIndex }
          show.seasons.push(season)
        }

        season.episodes.push({ number: item.index, watched_at: watchedAt })
        ratingKeysToMark.push(item.ratingKey)
      }
    }
  }

  const shows = [...showsMap.values()]

  if (movies.length === 0 && shows.length === 0) {
    return { episodes: 0, movies: 0 }
  }

  const result = await traktClient.syncWatchedHistory(accessToken, movies, shows)

  if (isError(result)) {
    logError(result, 'Trakt sync failed')
    return result
  }

  await markManyAsSynced(ratingKeysToMark)

  return result.added
}
