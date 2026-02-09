import { mock } from 'bun:test'

import { container, TOKENS } from '@/core/container'

export class TestPlexClient {
  getPlexMetadata = mock()
  getSectionMedia = mock()
  getSections = mock()
  refreshSection = mock(() => Promise.resolve())
  updateStream = mock(() => Promise.resolve())
  getBasicMediaInfo = mock(() => ({ file: '/path/to/file.mkv', ratingKey: 1, type: 'movie' }))
}

export class TestTmdbClient {
  getTmdbMedia = mock()
  getTmdbMovie = mock(() => Promise.resolve({}))
  getTmdbTvShow = mock(() => Promise.resolve({}))
}

export class TestCloudflareClient {
  getPublicIP = mock(() => Promise.resolve('1.2.3.4'))
  getZoneId = mock(() => Promise.resolve('zone-123'))
  getARecord = mock()
  updateDnsRecord = mock(() => Promise.resolve())
}

export class TestSonarrClient {
  getQueue = mock()
  getSeriesByPath = mock()
  refreshSeries = mock(() => Promise.resolve())
  removeQueueItem = mock(() => Promise.resolve())
  renameSeries = mock(() => Promise.resolve())
}

export class TestRadarrClient {
  getQueue = mock()
  getMovieByPath = mock()
  refreshMovie = mock(() => Promise.resolve())
  removeQueueItem = mock(() => Promise.resolve())
  renameMovie = mock(() => Promise.resolve())
}

container.register(TOKENS.PLEX_CLIENT, () => new TestPlexClient())
container.register(TOKENS.TMDB_CLIENT, () => new TestTmdbClient())
container.register(TOKENS.CLOUDFLARE_CLIENT, () => new TestCloudflareClient())
container.register(TOKENS.SONARR_CLIENT, () => new TestSonarrClient())
container.register(TOKENS.RADARR_CLIENT, () => new TestRadarrClient())
