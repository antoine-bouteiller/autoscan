import { httpStub } from '@tests/http_client_stub'
import { describe, expect, it } from '@tests/it'
import { Effect } from 'effect'
import { type HttpClient } from 'effect/http'

import { BazarrClient } from '@/integrations/bazarr/bazarr.service'

const movie = (overrides = {}) => ({ missing_subtitles: [], path: '/movies/Film.mkv', radarrId: 7, subtitles: [], title: 'Film', ...overrides })
const client = (transport: HttpClient.HttpClient) => new BazarrClient({ apiKey: 'key', apiUrl: 'https://bazarr.test', transport })

const entry = (overrides = {}) => ({ action: 1, provider: 'opensubtitles', subs_id: 'abc', subtitles_path: '/a.en.srt', ...overrides })
const sources = (data: unknown[], item: Parameters<BazarrClient['getSubtitleSources']>[0] = { id: 5, kind: 'movie' }) =>
  Effect.gen(function* () {
    const stub = httpStub(() => Effect.succeed(Response.json({ data, total: data.length })))
    const map = yield* client(stub.client).getSubtitleSources(item)
    return { calls: stub.calls, map }
  })

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
      // oxlint-disable-next-line unicorn/no-null
      yield* bazarr.setProfile({ id: 5, kind: 'movie' }, null)
      expect(stub.calls.map(({ request }) => request.method)).toEqual(['DELETE', 'PATCH', 'POST'])
      expect(stub.calls[0]?.url.pathname).toBe('/api/episodes/subtitles')
      expect(stub.calls[0]?.url.searchParams.get('seriesid')).toBe('4')
      expect(stub.calls[0]?.url.searchParams.get('episodeid')).toBe('5')
      expect(stub.calls[0]?.url.searchParams.get('forced')).toBe('true')
      expect(stub.calls[0]?.url.searchParams.get('hi')).toBe('true')
      expect(stub.calls[1]?.url.searchParams.get('language')).toBe('en')
      expect(stub.calls[1]?.url.searchParams.get('forced')).toBe('false')
      expect(stub.calls[2]?.url.searchParams.get('profileid')).toBe('null')
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
        Effect.exit(bazarr.translateSubtitle({ id: 5, kind: 'movie' }, subtitle, 'en')),
        Effect.exit(bazarr.setProfile({ id: 5, kind: 'movie' }, 12)),
      ])
      expect(exits.map((exit) => exit._tag)).toEqual(['Failure', 'Failure', 'Failure'])
      expect(stub.calls).toHaveLength(3)
    })
  )

  describe('modifySubtitle', () => {
    const subtitle = { forced: true, hi: false, language: 'en' as const, path: '/movies/Film.en.srt' }
    const modify = (item: Parameters<BazarrClient['modifySubtitle']>[0], fit: { offset: number; ratio: number }) =>
      Effect.gen(function* () {
        const stub = httpStub(() => Effect.succeed(new Response(undefined, { status: 204 })))
        yield* client(stub.client).modifySubtitle(item, subtitle, fit)
        return stub.calls[0]
      })

    it.effect('[VC-18] sends shift_offset for a constant offset', () =>
      Effect.gen(function* () {
        const call = yield* modify({ id: 5, kind: 'movie' }, { offset: 5, ratio: 1 })
        expect(call?.request.method).toBe('PATCH')
        expect(call?.url.pathname).toBe('/api/subtitles')
        expect(Object.fromEntries(call?.url.searchParams ?? [])).toEqual({
          action: 'shift_offset(h=0,m=0,s=0,ms=-5000)',
          forced: 'True',
          hi: 'False',
          id: '5',
          language: 'en',
          path: '/movies/Film.en.srt',
          type: 'movie',
        })
      })
    )

    it.effect('[VC-18] sends two_point_fit for a ratio and uses the episode type', () =>
      Effect.gen(function* () {
        const call = yield* modify({ id: 9, kind: 'episode', seriesId: 3 }, { offset: -52, ratio: 1.0425 })
        expect(call?.url.searchParams.get('action')).toBe('two_point_fit(rh=0,rm=0,rs=0,rms=0,from=1,to=1.0425,oh=0,om=0,os=0,oms=49880)')
        expect(call?.url.searchParams.get('type')).toBe('episode')
        expect(call?.url.searchParams.get('id')).toBe('9')
      })
    )

    it.effect('prints the ratio without floating-point noise', () =>
      Effect.gen(function* () {
        const call = yield* modify({ id: 5, kind: 'movie' }, { offset: 0, ratio: 1.0425000000000002 })
        expect(call?.url.searchParams.get('action')).toContain(',to=1.0425,')
        const fps = yield* modify({ id: 5, kind: 'movie' }, { offset: 0, ratio: 25 / 23.976 })
        expect(fps?.url.searchParams.get('action')).toContain(',to=1.042709,')
      })
    )
  })

  describe('getSubtitleSources', () => {
    it.effect('queries movie and episode history by their ids', () =>
      Effect.gen(function* () {
        const [movieCall] = (yield* sources([])).calls
        expect(movieCall?.request.method).toBe('GET')
        expect(movieCall?.url.pathname).toBe('/api/movies/history')
        expect(movieCall?.url.searchParams.get('radarrid')).toBe('5')
        const [episodeCall] = (yield* sources([], { id: 9, kind: 'episode', seriesId: 3 })).calls
        expect(episodeCall?.url.pathname).toBe('/api/episodes/history')
        expect(episodeCall?.url.searchParams.get('episodeid')).toBe('9')
      })
    )

    it.effect('maps downloaded, manual and upgraded entries to providers and translations to translation', () =>
      Effect.gen(function* () {
        const { map } = yield* sources([
          entry({ action: 1, subs_id: 'one', subtitles_path: '/1.srt' }),
          entry({ action: 2, subs_id: 'two', subtitles_path: '/2.srt' }),
          entry({ action: 3, subs_id: 'three', subtitles_path: '/3.srt' }),
          entry({ action: 6, provider: '', subs_id: '', subtitles_path: '/6.srt' }),
        ])
        expect(map.get('/1.srt')).toEqual({ kind: 'provider', provider: 'opensubtitles', subsId: 'one' })
        expect(map.get('/2.srt')).toEqual({ kind: 'provider', provider: 'opensubtitles', subsId: 'two' })
        expect(map.get('/3.srt')).toEqual({ kind: 'provider', provider: 'opensubtitles', subsId: 'three' })
        expect(map.get('/6.srt')).toEqual({ kind: 'translation' })
      })
    )

    it.effect('keeps the latest entry per path (history is newest first) and ignores other actions', () =>
      Effect.gen(function* () {
        const { map } = yield* sources([
          entry({ action: 4, subs_id: 'ignored' }),
          entry({ action: 6 }),
          entry({ action: 1, subs_id: 'older' }),
          entry({ action: 5, subs_id: 'removed', subtitles_path: '/only-ignored.srt' }),
        ])
        expect(map.get('/a.en.srt')).toEqual({ kind: 'translation' })
        expect(map.has('/only-ignored.srt')).toBe(false)
      })
    )

    it.effect('omits a path whose latest entry has no provider or subs_id, without falling back to older entries', () =>
      Effect.gen(function* () {
        const { map } = yield* sources([
          // oxlint-disable-next-line unicorn/no-null
          entry({ provider: null, subtitles_path: '/a.srt' }),
          entry({ subs_id: '', subtitles_path: '/b.srt' }),
          entry({ subtitles_path: '/a.srt' }),
          entry({ subtitles_path: '/b.srt' }),
        ])
        expect(map.has('/a.srt')).toBe(false)
        expect(map.has('/b.srt')).toBe(false)
      })
    )

    it.effect('fails when the history response is malformed', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(sources([{ provider: 'x' }]))
        expect(exit._tag).toBe('Failure')
      })
    )
  })

  describe('blacklistSubtitle', () => {
    const subtitle = { forced: false, hi: false, language: 'en' as const, path: '/a.en.srt' }
    const source = { kind: 'provider' as const, provider: 'opensubtitles', subsId: 'abc' }
    const fields = { language: 'en', provider: 'opensubtitles', subs_id: 'abc', subtitles_path: '/a.en.srt' }

    it.effect('posts the movie blacklist entry', () =>
      Effect.gen(function* () {
        const stub = httpStub(() => Effect.succeed(new Response(undefined, { status: 200 })))
        yield* client(stub.client).blacklistSubtitle({ id: 5, kind: 'movie' }, subtitle, source)
        expect(stub.calls[0]?.request.method).toBe('POST')
        expect(stub.calls[0]?.url.pathname).toBe('/api/movies/blacklist')
        expect(Object.fromEntries(stub.calls[0]?.url.searchParams ?? [])).toEqual({ ...fields, radarrid: '5' })
      })
    )

    it.effect('posts the episode blacklist entry with series and episode ids', () =>
      Effect.gen(function* () {
        const stub = httpStub(() => Effect.succeed(new Response(undefined, { status: 200 })))
        yield* client(stub.client).blacklistSubtitle({ id: 9, kind: 'episode', seriesId: 3 }, subtitle, source)
        expect(stub.calls[0]?.url.pathname).toBe('/api/episodes/blacklist')
        expect(Object.fromEntries(stub.calls[0]?.url.searchParams ?? [])).toEqual({ ...fields, episodeid: '9', seriesid: '3' })
      })
    )

    it.effect('propagates HTTP failures', () =>
      Effect.gen(function* () {
        const stub = httpStub(() => Effect.succeed(new Response('failure', { status: 500 })))
        const exit = yield* Effect.exit(client(stub.client).blacklistSubtitle({ id: 5, kind: 'movie' }, subtitle, source))
        expect(exit._tag).toBe('Failure')
      })
    )
  })
})
