import { jest } from 'bun:test'

import { Effect } from 'effect'

import { type BazarrItem, type BazarrItemRef, type BazarrSubtitleRef, type IBazarrClient } from '@/integrations/bazarr/bazarr.service'
import { NetworkError } from '@/shared/errors/network'
import { type HttpClientError } from '@/shared/types/http_client'
import { type ISOCode1 } from '@/shared/types/iso_codes'

export const setProfileMock = jest
  .fn<(item: Extract<BazarrItemRef, { kind: 'movie' }>, profileId: number | null) => Promise<void>>()
  .mockResolvedValue(undefined)
const deleteSubtitleMock = jest.fn<(item: BazarrItemRef, subtitle: BazarrSubtitleRef) => Promise<void>>().mockResolvedValue(undefined)
const syncSubtitleMock = jest.fn<(item: BazarrItemRef, subtitle: BazarrSubtitleRef) => Promise<void>>().mockResolvedValue(undefined)
const translateSubtitleMock = jest
  .fn<(item: BazarrItemRef, source: BazarrSubtitleRef, target: ISOCode1) => Promise<void>>()
  .mockResolvedValue(undefined)

const fromPromise = <Value>(run: () => Promise<Value>) =>
  Effect.tryPromise({
    catch: (cause) => new NetworkError({ cause, originalMessage: String(cause), serviceName: 'BazarrTest' }),
    try: run,
  })

export class MockBazarrClient implements IBazarrClient {
  get getWantedMovies(): Effect.Effect<BazarrItem[], HttpClientError> {
    return Effect.succeed([])
  }

  get getWantedEpisodes(): Effect.Effect<BazarrItem[], HttpClientError> {
    return Effect.succeed([])
  }

  getMovieByPath(_filePath: string): Effect.Effect<BazarrItem | undefined, HttpClientError> {
    return Effect.void.pipe(Effect.as(undefined))
  }

  getEpisodeByPath(_filePath: string): Effect.Effect<BazarrItem | undefined, HttpClientError> {
    return Effect.void.pipe(Effect.as(undefined))
  }

  get getProfiles(): Effect.Effect<{ profileId: number; name: string }[], HttpClientError> {
    return Effect.succeed([])
  }

  setProfile(item: Extract<BazarrItemRef, { kind: 'movie' }>, profileId: number | null) {
    return fromPromise(() => setProfileMock(item, profileId))
  }

  deleteSubtitle(item: BazarrItemRef, subtitle: BazarrSubtitleRef) {
    return fromPromise(() => deleteSubtitleMock(item, subtitle))
  }

  syncSubtitle(item: BazarrItemRef, subtitle: BazarrSubtitleRef) {
    return fromPromise(() => syncSubtitleMock(item, subtitle))
  }

  translateSubtitle(item: BazarrItemRef, source: BazarrSubtitleRef, target: ISOCode1) {
    return fromPromise(() => translateSubtitleMock(item, source, target))
  }
}
