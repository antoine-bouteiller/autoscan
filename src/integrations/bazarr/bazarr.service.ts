import { Effect, Result, Schema } from 'effect'
import { type HttpClient as EffectHttpClient } from 'effect/http'

import {
  type BazarrEpisodeRow,
  type BazarrMissingSubtitle,
  type BazarrMovieRow,
  episodesResponseValidator,
  episodeValidator,
  historyResponseValidator,
  lookupEpisodesResponseValidator,
  lookupMoviesResponseValidator,
  moviesResponseValidator,
  movieValidator,
  profilesValidator,
  seriesResponseValidator,
  wantedEpisodesResponseValidator,
  wantedMoviesResponseValidator,
} from '@/integrations/bazarr/bazarr.validator'
import { ValidationError } from '@/shared/errors/validation'
import { type HttpClientError } from '@/shared/types/http_client'
import { type ISOCode1 } from '@/shared/types/iso_codes'
import { httpClient } from '@/shared/utils/http_client'
import { formatSchemaIssueMessage } from '@/shared/utils/schema'

export type BazarrItemRef = { kind: 'movie'; id: number } | { kind: 'episode'; id: number; seriesId: number }
export interface BazarrSubtitleRef {
  language: ISOCode1
  forced: boolean
  hi: boolean
  path: string
}
export type SubtitleSource = { kind: 'provider'; provider: string; subsId: string } | { kind: 'translation' }
export interface SubtitleFit {
  readonly offset: number
  readonly ratio: number
}
export type BazarrItem = BazarrItemRef & {
  title: string
  path: string
  subtitles: BazarrSubtitleRef[]
  missingSubtitles: { language: ISOCode1; forced: boolean }[]
}
export interface IBazarrClient {
  readonly getWantedMovies: Effect.Effect<BazarrItem[], HttpClientError>
  readonly getWantedEpisodes: Effect.Effect<BazarrItem[], HttpClientError>
  readonly getMovieByPath: (filePath: string) => Effect.Effect<BazarrItem | undefined, HttpClientError>
  readonly getEpisodeByPath: (filePath: string) => Effect.Effect<BazarrItem | undefined, HttpClientError>
  readonly getProfiles: Effect.Effect<{ profileId: number; name: string }[], HttpClientError>
  readonly setProfile: (item: Extract<BazarrItemRef, { kind: 'movie' }>, profileId: number | null) => Effect.Effect<void, HttpClientError>
  readonly deleteSubtitle: (item: BazarrItemRef, subtitle: BazarrSubtitleRef) => Effect.Effect<void, HttpClientError>
  readonly modifySubtitle: (item: BazarrItemRef, subtitle: BazarrSubtitleRef, fit: SubtitleFit) => Effect.Effect<void, HttpClientError>
  readonly getSubtitleSources: (item: BazarrItemRef) => Effect.Effect<ReadonlyMap<string, SubtitleSource>, HttpClientError>
  readonly blacklistSubtitle: (
    item: BazarrItemRef,
    subtitle: BazarrSubtitleRef,
    source: Extract<SubtitleSource, { kind: 'provider' }>
  ) => Effect.Effect<void, HttpClientError>
  readonly translateSubtitle: (item: BazarrItemRef, source: BazarrSubtitleRef, target: ISOCode1) => Effect.Effect<void, HttpClientError>
}

interface BazarrClientConfig {
  apiKey: string
  apiUrl: string
  transport: EffectHttpClient.HttpClient
}

const HISTORY_DOWNLOADED = new Set([1, 2, 3])
const HISTORY_SYNCED = 5
const HISTORY_TRANSLATED = 6
const fitAction = ({ offset, ratio }: SubtitleFit) =>
  ratio === 1
    ? `shift_offset(h=0,m=0,s=0,ms=${Math.round(-1000 * offset)})`
    : `two_point_fit(rh=0,rm=0,rs=0,rms=0,from=1,to=${Number(ratio.toFixed(6))},oh=0,om=0,os=0,oms=${Math.round((-1000 * offset) / ratio)})`

const missingSubtitles = (subtitles: readonly BazarrMissingSubtitle[]) => subtitles.map(({ code2, forced }) => ({ forced, language: code2 }))
const subtitles = (rows: BazarrMovieRow['subtitles']) =>
  rows
    .filter((subtitle): subtitle is typeof subtitle & { path: string } => subtitle.path !== null && subtitle.path !== '')
    .map(({ code2, forced, hi, path }) => ({ forced, hi, language: code2, path }))
const matchesPath = (row: unknown, filePath: string) =>
  typeof row === 'object' && row !== null && Object.entries(row).some(([key, value]) => key === 'path' && value === filePath)
const decodeMovie = (row: unknown) => {
  const result = Schema.decodeUnknownResult(movieValidator, { errors: 'all' })(row)
  return Result.isFailure(result)
    ? Effect.fail(ValidationError.make({ details: formatSchemaIssueMessage(result.failure.issue) }))
    : Effect.succeed(result.success)
}
const decodeEpisode = (row: unknown) => {
  const result = Schema.decodeUnknownResult(episodeValidator, { errors: 'all' })(row)
  return Result.isFailure(result)
    ? Effect.fail(ValidationError.make({ details: formatSchemaIssueMessage(result.failure.issue) }))
    : Effect.succeed(result.success)
}
const movie = (row: BazarrMovieRow, missing = row.missing_subtitles): BazarrItem => ({
  id: row.radarrId,
  kind: 'movie',
  missingSubtitles: missingSubtitles(missing),
  path: row.path,
  subtitles: subtitles(row.subtitles),
  title: row.title,
})
const episode = (row: BazarrEpisodeRow, missing = row.missing_subtitles): BazarrItem => ({
  id: row.sonarrEpisodeId,
  kind: 'episode',
  missingSubtitles: missingSubtitles(missing),
  path: row.path,
  seriesId: row.sonarrSeriesId,
  subtitles: subtitles(row.subtitles),
  title: row.title,
})

export class BazarrClient implements IBazarrClient {
  private readonly client: ReturnType<typeof httpClient>

  constructor({ apiKey, apiUrl, transport }: BazarrClientConfig) {
    this.client = httpClient({ baseUrl: `${apiUrl}/api`, headers: { 'X-API-KEY': apiKey }, serviceName: 'Bazarr', transport })
  }

  private getMovie(id: number) {
    return this.client.get('movies', { params: { 'radarrid[]': id }, validator: moviesResponseValidator }).pipe(
      Effect.flatMap(({ data }) => {
        const row = data.find((candidate) => candidate.radarrId === id)
        return row === undefined ? Effect.fail(ValidationError.make({ details: `Movie ${id} was not returned` })) : Effect.succeed(movie(row))
      })
    )
  }

  private getEpisode(id: number) {
    return this.client.get('episodes', { params: { 'episodeid[]': id }, validator: episodesResponseValidator }).pipe(
      Effect.flatMap(({ data }) => {
        const row = data.find((candidate) => candidate.sonarrEpisodeId === id)
        return row === undefined ? Effect.fail(ValidationError.make({ details: `Episode ${id} was not returned` })) : Effect.succeed(episode(row))
      })
    )
  }

  get getWantedMovies() {
    return this.client.get('movies/wanted', { params: { length: -1 }, validator: wantedMoviesResponseValidator }).pipe(
      Effect.flatMap(({ data, total }) => {
        if (data.length !== total) {
          return Effect.fail(ValidationError.make({ details: `Wanted movies snapshot is incomplete: expected ${total}, received ${data.length}` }))
        }
        return Effect.forEach((wanted: (typeof data)[number]) =>
          this.getMovie(wanted.radarrId).pipe(Effect.map((item) => ({ ...item, missingSubtitles: missingSubtitles(wanted.missing_subtitles) })))
        )(data)
      })
    )
  }

  get getWantedEpisodes() {
    return this.client.get('episodes/wanted', { params: { length: -1 }, validator: wantedEpisodesResponseValidator }).pipe(
      Effect.flatMap(({ data, total }) => {
        if (data.length !== total) {
          return Effect.fail(ValidationError.make({ details: `Wanted episodes snapshot is incomplete: expected ${total}, received ${data.length}` }))
        }
        return Effect.forEach((wanted: (typeof data)[number]) =>
          this.getEpisode(wanted.sonarrEpisodeId).pipe(
            Effect.map((item) => ({ ...item, missingSubtitles: missingSubtitles(wanted.missing_subtitles) }))
          )
        )(data)
      })
    )
  }

  getMovieByPath(filePath: string) {
    return this.client.get('movies', { params: { length: -1 }, validator: lookupMoviesResponseValidator }).pipe(
      Effect.flatMap(({ data }) => {
        const row = data.find((candidate) => matchesPath(candidate, filePath))
        return row === undefined ? Effect.void.pipe(Effect.as(undefined)) : decodeMovie(row).pipe(Effect.map(movie))
      })
    )
  }

  getEpisodeByPath(filePath: string) {
    return this.client.get('series', { params: { length: -1 }, validator: seriesResponseValidator }).pipe(
      Effect.flatMap(({ data }) => {
        const [series] = data
          .filter(({ path }) => filePath === path || filePath.startsWith(path.endsWith('/') ? path : `${path}/`))
          .toSorted((left, right) => right.path.length - left.path.length)
        if (series === undefined) {
          return Effect.void.pipe(Effect.as(undefined))
        }
        return this.client.get('episodes', { params: { 'seriesid[]': series.sonarrSeriesId }, validator: lookupEpisodesResponseValidator }).pipe(
          Effect.flatMap(({ data: episodes }) => {
            const row = episodes.find((candidate) => matchesPath(candidate, filePath))
            return row === undefined ? Effect.void.pipe(Effect.as(undefined)) : decodeEpisode(row).pipe(Effect.map(episode))
          })
        )
      })
    )
  }

  get getProfiles() {
    return this.client.get('system/languages/profiles', { validator: profilesValidator }).pipe(Effect.map((profiles) => [...profiles]))
  }

  setProfile(item: Extract<BazarrItemRef, { kind: 'movie' }>, profileId: number | null) {
    return this.client.post('movies', { params: { profileid: profileId === null ? 'null' : String(profileId), radarrid: item.id } })
  }

  deleteSubtitle(item: BazarrItemRef, subtitle: BazarrSubtitleRef) {
    return item.kind === 'movie'
      ? this.client.delete('movies/subtitles', {
          params: { forced: subtitle.forced, hi: subtitle.hi, language: subtitle.language, path: subtitle.path, radarrid: item.id },
        })
      : this.client.delete('episodes/subtitles', {
          params: {
            episodeid: item.id,
            forced: subtitle.forced,
            hi: subtitle.hi,
            language: subtitle.language,
            path: subtitle.path,
            seriesid: item.seriesId,
          },
        })
  }

  modifySubtitle(item: BazarrItemRef, subtitle: BazarrSubtitleRef, fit: SubtitleFit) {
    return this.client.patch('subtitles', {
      params: {
        action: fitAction(fit),
        forced: subtitle.forced ? 'True' : 'False',
        hi: subtitle.hi ? 'True' : 'False',
        id: item.id,
        language: subtitle.language,
        path: subtitle.path,
        type: item.kind,
      },
    })
  }

  getSubtitleSources(item: BazarrItemRef) {
    const request =
      item.kind === 'movie'
        ? this.client.get('movies/history', { params: { radarrid: item.id }, validator: historyResponseValidator })
        : this.client.get('episodes/history', { params: { episodeid: item.id }, validator: historyResponseValidator })
    return request.pipe(
      Effect.map(({ data }) => {
        const sources = new Map<string, SubtitleSource | undefined>()
        // Bazarr orders history by timestamp descending, and its timestamp field is a relative string, so the first entry per path is the latest.
        // A sync rewrites the file in place, so the entry before it still names its origin; any other action replaces that origin.
        for (const { action, provider, subs_id: subsId, subtitles_path: path } of data) {
          if (path === null || path === '' || sources.has(path) || action === HISTORY_SYNCED) {
            continue
          }
          if (action === HISTORY_TRANSLATED) {
            sources.set(path, { kind: 'translation' })
          } else {
            sources.set(
              path,
              HISTORY_DOWNLOADED.has(action) && provider !== null && provider !== '' && subsId !== null && subsId !== ''
                ? { kind: 'provider', provider, subsId }
                : undefined
            )
          }
        }
        return new Map([...sources].filter((entry): entry is [string, SubtitleSource] => entry[1] !== undefined))
      })
    )
  }

  blacklistSubtitle(item: BazarrItemRef, subtitle: BazarrSubtitleRef, source: Extract<SubtitleSource, { kind: 'provider' }>) {
    const fields = { language: subtitle.language, provider: source.provider, subs_id: source.subsId, subtitles_path: subtitle.path }
    return item.kind === 'movie'
      ? this.client.post('movies/blacklist', { params: { ...fields, radarrid: item.id } })
      : this.client.post('episodes/blacklist', { params: { ...fields, episodeid: item.id, seriesid: item.seriesId } })
  }

  translateSubtitle(item: BazarrItemRef, source: BazarrSubtitleRef, target: ISOCode1) {
    return this.client.patch('subtitles', {
      params: { action: 'translate', forced: 'false', hi: String(source.hi), id: item.id, language: target, path: source.path, type: item.kind },
    })
  }
}
