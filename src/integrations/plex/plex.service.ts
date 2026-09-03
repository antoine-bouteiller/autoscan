import { Effect, Path } from 'effect'
import { type HttpClient as EffectHttpClient } from 'effect/unstable/http'

import { type DatabaseQueryError } from '@/config/db'
import { type Database } from '@/core/runtime.service'
import { PlexError, PlexUnauthenticatedError } from '@/integrations/plex/plex.errors'
import { plexPinValidator, plexResponseValidator, type PlexMedia, type PlexPin } from '@/integrations/plex/plex.validator'
import { HttpError } from '@/shared/errors/http'
import { type HttpClientError } from '@/shared/types/http_client'
import { httpClient } from '@/shared/utils/http_client'

export type MediaType = 'movie' | 'show'
type TokenError = DatabaseQueryError | PlexUnauthenticatedError

const PLEX_TV_URL = 'https://plex.tv/api/v2'
const PLEX_PRODUCT = 'Autoscan'

export interface IPlexClient {
  readonly checkPin: (id: number, clientIdentifier: string) => Effect.Effect<string | undefined, HttpClientError>
  readonly createPin: (clientIdentifier: string) => Effect.Effect<PlexPin, HttpClientError>
  readonly getBasicMediaInfo: (plexMedia: PlexMedia) => { file: string | undefined; ratingKey: string; type: string }
  readonly getPlexMetadata: (ratingKey: number) => Effect.Effect<PlexMedia, HttpClientError | PlexError | TokenError, Database>
  readonly getSectionMedia: (id: number, sectionType: MediaType) => Effect.Effect<PlexMedia[], HttpClientError | TokenError, Database>
  readonly getSections: Effect.Effect<{ key: number; title: string; type: MediaType }[], HttpClientError | TokenError, Database>
  readonly refreshSection: (id: number, filePath: string) => Effect.Effect<void, HttpClientError | TokenError, Database>
  readonly refreshSections: (filePath: string, mediaType: MediaType) => Effect.Effect<void, HttpClientError | TokenError, Database | Path.Path>
  readonly updateStream: (
    partsId: number,
    streamId: number,
    type: 'audio' | 'subtitle'
  ) => Effect.Effect<void, HttpClientError | TokenError, Database>
  readonly verifyToken: (token: string, clientIdentifier: string) => Effect.Effect<boolean, HttpClientError>
}

interface PlexClientConfig {
  invalidate: Effect.Effect<void>
  token: Effect.Effect<string, TokenError, Database>
  transport: EffectHttpClient.HttpClient
  url: string
}

export class PlexClient implements IPlexClient {
  private readonly client: ReturnType<typeof httpClient>
  private readonly invalidate: Effect.Effect<void>
  private readonly plexTv: ReturnType<typeof httpClient>
  private readonly token: Effect.Effect<string, TokenError, Database>

  constructor(config: PlexClientConfig) {
    this.invalidate = config.invalidate
    this.token = config.token
    this.client = httpClient({
      baseUrl: config.url,
      headers: { Accept: 'application/json' },
      serviceName: 'Plex',
      transport: config.transport,
    })
    this.plexTv = httpClient({
      baseUrl: PLEX_TV_URL,
      headers: { Accept: 'application/json', 'X-Plex-Product': PLEX_PRODUCT },
      serviceName: 'Plex.tv',
      transport: config.transport,
    })
  }

  private authorized<Success>(request: (headers: Record<string, string>) => Effect.Effect<Success, HttpClientError>) {
    return this.token.pipe(
      Effect.flatMap((token) => request({ 'X-Plex-Token': token })),
      Effect.catchIf(
        (error) => error instanceof HttpError && error.status === 401,
        () => this.invalidate.pipe(Effect.flatMap(() => new PlexUnauthenticatedError()))
      )
    )
  }

  private identity(clientIdentifier: string) {
    return { 'X-Plex-Client-Identifier': clientIdentifier }
  }

  getPlexMetadata(ratingKey: number) {
    return this.authorized((headers) => this.client.get(`library/metadata/${ratingKey}`, { headers, validator: plexResponseValidator })).pipe(
      Effect.flatMap((response) => {
        const metadata = response.MediaContainer.Metadata?.[0]
        return metadata === undefined ? Effect.fail(new PlexError({ ratingKey })) : Effect.succeed(metadata)
      })
    )
  }

  getBasicMediaInfo(plexMedia: PlexMedia) {
    return {
      file: plexMedia.Media[0]?.Part[0]?.file,
      ratingKey: plexMedia.ratingKey,
      type: plexMedia.type === 'episode' ? 'show' : plexMedia.type,
    }
  }

  getSectionMedia(id: number, sectionType: MediaType) {
    const type = sectionType === 'show' ? 4 : 1
    return this.authorized((headers) =>
      this.client.get(`library/sections/${id}/all`, { headers, params: { type }, validator: plexResponseValidator })
    ).pipe(Effect.map((response) => response.MediaContainer.Metadata ?? []))
  }

  get getSections() {
    return this.authorized((headers) => this.client.get('library/sections', { headers, validator: plexResponseValidator })).pipe(
      Effect.map((response) => response.MediaContainer.Directory ?? [])
    )
  }

  refreshSection(id: number, filePath: string) {
    return this.authorized((headers) => this.client.get(`library/sections/${id}/refresh`, { headers, params: { path: filePath }, retry: false }))
  }

  refreshSections(filePath: string, mediaType: MediaType) {
    const client = this
    return Effect.gen(function* () {
      const path = yield* Path.Path
      const fileDirectory = path.resolve(filePath, '..')
      const sections = yield* client.getSections
      yield* Effect.forEach(
        sections.filter((section) => section.type === mediaType),
        (section) => client.refreshSection(section.key, fileDirectory),
        { concurrency: 'unbounded', discard: true }
      )
    })
  }

  updateStream(partsId: number, streamId: number, type: 'audio' | 'subtitle') {
    return this.authorized((headers) =>
      this.client.put(`library/parts/${partsId}`, { headers, params: { [`${type}StreamID`]: streamId, allParts: 1 } })
    )
  }

  createPin(clientIdentifier: string) {
    return this.plexTv.post('pins', { headers: this.identity(clientIdentifier), params: { strong: true }, validator: plexPinValidator })
  }

  checkPin(id: number, clientIdentifier: string) {
    return this.plexTv
      .get(`pins/${id}`, { headers: this.identity(clientIdentifier), retry: false, validator: plexPinValidator })
      .pipe(Effect.map((pin) => pin.authToken ?? undefined))
  }

  verifyToken(token: string, clientIdentifier: string) {
    return this.plexTv.get('user', { headers: { ...this.identity(clientIdentifier), 'X-Plex-Token': token }, retry: false }).pipe(
      Effect.as(true),
      Effect.catchIf(
        (error) => error instanceof HttpError && (error.status === 401 || error.status === 403),
        () => Effect.succeed(false)
      )
    )
  }
}
