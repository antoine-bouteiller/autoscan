import { httpStub } from '@tests/http_client_stub'
import { describe, expect, it } from '@tests/it'
import { Effect } from 'effect'
import { type HttpClient } from 'effect/unstable/http'

import { BazarrClient } from '@/integrations/bazarr/bazarr.service'

const movie = (overrides = {}) => ({ missing_subtitles: [], path: '/movies/Film.mkv', radarrId: 7, subtitles: [], title: 'Film', ...overrides })
const client = (transport: HttpClient.HttpClient) => new BazarrClient({ apiKey: 'key', apiUrl: 'https://bazarr.test', transport })

describe('BazarrClient', () => {
  it.effect('scans movie paths and excludes embedded subtitles', () =>
    Effect.gen(function* () {
      const stub = httpStub(() =>
        Effect.succeed(
          Response.json({
            data: [
              movie({ path: '/movies/Other.mkv', radarrId: 8, subtitles: [{ code2: 'pb', forced: false, hi: false, path: '/movies/Other.pb.srt' }] }),
              movie({
                subtitles: [
                  {
                    code2: 'fra',
                    forced: false,
                    hi: false, // oxlint-disable-next-line unicorn/no-null
                    path: null,
                  },
                  { code2: 'eng', forced: true, hi: false, path: '/movies/Film.en.srt' },
                ],
              }),
            ],
            total: 1,
          })
        )
      )
      const item = yield* client(stub.client).getMovieByPath('/movies/Film.mkv')
      expect(item?.subtitles).toEqual([{ forced: true, hi: false, language: 'en', path: '/movies/Film.en.srt' }])
      expect(stub.calls[0]?.url.href).toBe('https://bazarr.test/api/movies?length=-1')
      expect(stub.calls[0]?.request.headers['x-api-key']).toBe('key')
      expect(stub.calls[0]?.request.method).toBe('GET')
    })
  )

  it.effect('fails lookup when the exact-path movie is invalid', () =>
    Effect.gen(function* () {
      const stub = httpStub(() =>
        Effect.succeed(
          Response.json({
            data: [movie({ subtitles: [{ code2: 'pb', forced: false, hi: false, path: '/movies/Film.pb.srt' }] })],
            total: 1,
          })
        )
      )
      const exit = yield* Effect.exit(client(stub.client).getMovieByPath('/movies/Film.mkv'))
      expect(exit._tag).toBe('Failure')
    })
  )

  it.effect('returns undefined when no movie has the requested path', () =>
    Effect.gen(function* () {
      const stub = httpStub(() => Effect.succeed(Response.json({ data: [movie({ path: '/movies/Other.mkv' })], total: 1 })))
      expect(yield* client(stub.client).getMovieByPath('/movies/Film.mkv')).toBeUndefined()
    })
  )

  it.effect('hydrates wanted movies by their exact ID rather than response position', () =>
    Effect.gen(function* () {
      let requests = 0
      const stub = httpStub(() => {
        requests += 1
        return Effect.succeed(
          Response.json(
            requests === 1
              ? { data: [{ missing_subtitles: [{ code2: 'eng', forced: false, hi: false }], radarrId: 7 }], total: 1 }
              : { data: [movie({ radarrId: 6, title: 'Other' }), movie({ radarrId: 7 })], total: 2 }
          )
        )
      })
      const wanted = yield* client(stub.client).getWantedMovies
      expect(wanted).toMatchObject([{ id: 7, missingSubtitles: [{ forced: false, language: 'en' }], title: 'Film' }])
    })
  )

  it.effect('hydrates wanted episodes by their exact ID rather than response position', () =>
    Effect.gen(function* () {
      let requests = 0
      const stub = httpStub(() => {
        requests += 1
        return Effect.succeed(
          Response.json(
            requests === 1
              ? { data: [{ missing_subtitles: [], sonarrEpisodeId: 7, sonarrSeriesId: 3 }], total: 1 }
              : {
                  data: [
                    { missing_subtitles: [], path: '/tv/Other/E01.mkv', sonarrEpisodeId: 6, sonarrSeriesId: 2, subtitles: [], title: 'Other' },
                    { missing_subtitles: [], path: '/tv/Show/E01.mkv', sonarrEpisodeId: 7, sonarrSeriesId: 3, subtitles: [], title: 'Episode' },
                  ],
                }
          )
        )
      })
      const wanted = yield* client(stub.client).getWantedEpisodes
      expect(wanted).toMatchObject([{ id: 7, kind: 'episode', seriesId: 3, title: 'Episode' }])
    })
  )

  it.effect('fails wanted movie retrieval when a hydration returns no record', () =>
    Effect.gen(function* () {
      let requests = 0
      const stub = httpStub(() => {
        requests += 1
        return Effect.succeed(Response.json(requests === 1 ? { data: [{ missing_subtitles: [], radarrId: 7 }], total: 1 } : { data: [], total: 0 }))
      })
      const exit = yield* Effect.exit(client(stub.client).getWantedMovies)
      expect(exit._tag).toBe('Failure')
      expect(stub.calls[0]?.url.href).toBe('https://bazarr.test/api/movies/wanted?length=-1')
      expect(stub.calls[1]?.url.searchParams.get('radarrid[]')).toBe('7')
    })
  )

  it.effect('rejects an incomplete wanted snapshot before hydration', () =>
    Effect.gen(function* () {
      const stub = httpStub(() => Effect.succeed(Response.json({ data: [{ missing_subtitles: [], radarrId: 7 }], total: 2 })))
      const exit = yield* Effect.exit(client(stub.client).getWantedMovies)
      expect(exit._tag).toBe('Failure')
      expect(stub.calls).toHaveLength(1)
    })
  )

  it.effect('uses the longest boundary-respecting series path for episode lookup', () =>
    Effect.gen(function* () {
      const stub = httpStub(({ url }) =>
        Effect.succeed(
          url.pathname.endsWith('/series')
            ? Response.json({
                data: [
                  { path: '/tv/Show', sonarrSeriesId: 1 },
                  { path: '/tv/Show 2', sonarrSeriesId: 2 },
                ],
              })
            : Response.json({
                data: [
                  {
                    missing_subtitles: [],
                    path: '/tv/Show 2/Other.mkv',
                    sonarrEpisodeId: 4,
                    sonarrSeriesId: 2,
                    subtitles: [{ code2: 'pb', forced: false, hi: false, path: '/tv/Show 2/Other.pb.srt' }],
                    title: 'Other',
                  },
                  { missing_subtitles: [], path: '/tv/Show 2/E01.mkv', sonarrEpisodeId: 3, sonarrSeriesId: 2, subtitles: [], title: 'Episode' },
                ],
              })
        )
      )
      const item = yield* client(stub.client).getEpisodeByPath('/tv/Show 2/E01.mkv')
      expect(item).toMatchObject({ id: 3, kind: 'episode', seriesId: 2, title: 'Episode' })
      expect(stub.calls[1]?.url.searchParams.get('seriesid[]')).toBe('2')
    })
  )

  it.effect('fails lookup when the exact-path episode is invalid', () =>
    Effect.gen(function* () {
      const stub = httpStub(({ url }) =>
        Effect.succeed(
          url.pathname.endsWith('/series')
            ? Response.json({ data: [{ path: '/tv/Show', sonarrSeriesId: 2 }] })
            : Response.json({
                data: [
                  {
                    missing_subtitles: [],
                    path: '/tv/Show/E01.mkv',
                    sonarrEpisodeId: 3,
                    sonarrSeriesId: 2,
                    subtitles: [{ code2: 'pb', forced: false, hi: false, path: '/tv/Show/E01.pb.srt' }],
                    title: 'Episode',
                  },
                ],
              })
        )
      )
      const exit = yield* Effect.exit(client(stub.client).getEpisodeByPath('/tv/Show/E01.mkv'))
      expect(exit._tag).toBe('Failure')
    })
  )

  it.effect('returns undefined when no series contains the requested episode path', () =>
    Effect.gen(function* () {
      const stub = httpStub(() => Effect.succeed(Response.json({ data: [{ path: '/tv/Other', sonarrSeriesId: 1 }] })))
      expect(yield* client(stub.client).getEpisodeByPath('/tv/Show/E01.mkv')).toBeUndefined()
      expect(stub.calls).toHaveLength(1)
    })
  )

  it.effect('uses Bazarr mutation routes and query parameters', () =>
    Effect.gen(function* () {
      const stub = httpStub(() => Effect.succeed(new Response(undefined, { status: 204 })))
      const bazarr = client(stub.client)
      const subtitle = { forced: true, hi: true, language: 'fr' as const, path: '/a.srt' }
      yield* bazarr.deleteSubtitle({ id: 5, kind: 'episode', seriesId: 4 }, subtitle)
      yield* bazarr.translateSubtitle({ id: 5, kind: 'episode', seriesId: 4 }, subtitle, 'en')
      yield* bazarr.syncSubtitle({ id: 5, kind: 'movie' }, subtitle)
      // oxlint-disable-next-line unicorn/no-null
      yield* bazarr.setProfile({ id: 5, kind: 'movie' }, null)
      expect(stub.calls.map(({ request }) => request.method)).toEqual(['DELETE', 'PATCH', 'PATCH', 'POST'])
      expect(stub.calls[0]?.url.pathname).toBe('/api/episodes/subtitles')
      expect(stub.calls[0]?.url.searchParams.get('seriesid')).toBe('4')
      expect(stub.calls[0]?.url.searchParams.get('episodeid')).toBe('5')
      expect(stub.calls[0]?.url.searchParams.get('forced')).toBe('true')
      expect(stub.calls[0]?.url.searchParams.get('hi')).toBe('true')
      expect(stub.calls[1]?.url.searchParams.get('language')).toBe('en')
      expect(stub.calls[1]?.url.searchParams.get('forced')).toBe('false')
      expect(stub.calls[2]?.url.searchParams.get('hi')).toBe('true')
      expect(stub.calls[2]?.url.searchParams.get('language')).toBe('fr')
      expect(stub.calls[3]?.url.searchParams.get('profileid')).toBe('null')
    })
  )

  it.effect('lists numeric profiles and encodes numeric profile assignment', () =>
    Effect.gen(function* () {
      let requests = 0
      const stub = httpStub(() => {
        requests += 1
        return Effect.succeed(requests === 1 ? Response.json([{ name: 'French forced', profileId: 12 }]) : new Response(undefined, { status: 204 }))
      })
      const bazarr = client(stub.client)
      expect(yield* bazarr.getProfiles).toEqual([{ name: 'French forced', profileId: 12 }])
      yield* bazarr.setProfile({ id: 5, kind: 'movie' }, 12)
      expect(stub.calls[1]?.url.searchParams.get('profileid')).toBe('12')
    })
  )

  it.effect('propagates HTTP failures from Bazarr mutations', () =>
    Effect.gen(function* () {
      const stub = httpStub(() => Effect.succeed(new Response('failure', { status: 500 })))
      const bazarr = client(stub.client)
      const subtitle = { forced: false, hi: false, language: 'fr' as const, path: '/a.srt' }
      const exits = yield* Effect.all([
        Effect.exit(bazarr.deleteSubtitle({ id: 5, kind: 'movie' }, subtitle)),
        Effect.exit(bazarr.syncSubtitle({ id: 5, kind: 'movie' }, subtitle)),
        Effect.exit(bazarr.translateSubtitle({ id: 5, kind: 'movie' }, subtitle, 'en')),
        Effect.exit(bazarr.setProfile({ id: 5, kind: 'movie' }, 12)),
      ])
      expect(exits.map((exit) => exit._tag)).toEqual(['Failure', 'Failure', 'Failure', 'Failure'])
      expect(stub.calls).toHaveLength(4)
    })
  )
})
