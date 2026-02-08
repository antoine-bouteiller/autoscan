import { mock } from 'bun:test'

void mock.module('@/config/env', () => ({
  default: {
    CLOUDFLARE_TOKEN: 'test-token',
    DATABASE_URL: ':memory:',
    DOMAIN: 'example.com',
    PLEX_TOKEN: 'test-plex-token',
    PLEX_URL: 'http://plex.test',
    RADARR_API_KEY: 'test-radarr-key',
    RADARR_API_URL: 'http://radarr.test',
    SONARR_API_KEY: 'test-sonarr-key',
    SONARR_API_URL: 'http://sonarr.test',
    TMDB_API_TOKEN: 'test-tmdb-token',
    TMDB_API_URL: 'http://tmdb.test',
  },
}))

export const mockGetPlexMetadata = mock()
export const mockGetSectionMedia = mock()
export const mockGetSections = mock()
export const mockRefreshSection = mock()
export const mockUpdateStream = mock()
export const mockGetBasicMediaInfo = mock()

export const mockPlexClient = {
  getBasicMediaInfo: mockGetBasicMediaInfo,
  getPlexMetadata: mockGetPlexMetadata,
  getSectionMedia: mockGetSectionMedia,
  getSections: mockGetSections,
  refreshSection: mockRefreshSection,
  updateStream: mockUpdateStream,
}

export const mockGetTmdbMedia = mock()
export const mockGetTmdbMovie = mock()
export const mockGetTmdbTvShow = mock()

export const mockTmdbClient = {
  getTmdbMedia: mockGetTmdbMedia,
  getTmdbMovie: mockGetTmdbMovie,
  getTmdbTvShow: mockGetTmdbTvShow,
}

export const mockGetPublicIP = mock()
export const mockGetZoneId = mock()
export const mockGetARecord = mock()
export const mockUpdateDnsRecord = mock()

export const mockCloudflareClient = {
  getARecord: mockGetARecord,
  getPublicIP: mockGetPublicIP,
  getZoneId: mockGetZoneId,
  updateDnsRecord: mockUpdateDnsRecord,
}

export const mockSonarrGetQueue = mock()
export const mockSonarrRemoveQueueItem = mock()
export const mockRefreshSeries = mock()
export const mockRenameSeries = mock()
export const mockGetSeriesByPath = mock()

export const mockSonarrClient = {
  getQueue: mockSonarrGetQueue,
  getSeriesByPath: mockGetSeriesByPath,
  refreshSeries: mockRefreshSeries,
  removeQueueItem: mockSonarrRemoveQueueItem,
  renameSeries: mockRenameSeries,
}

export const mockRadarrGetQueue = mock()
export const mockRadarrRemoveQueueItem = mock()
export const mockRefreshMovie = mock()
export const mockRenameMovie = mock()
export const mockGetMovieByPath = mock()

export const mockRadarrClient = {
  getMovieByPath: mockGetMovieByPath,
  getQueue: mockRadarrGetQueue,
  refreshMovie: mockRefreshMovie,
  removeQueueItem: mockRadarrRemoveQueueItem,
  renameMovie: mockRenameMovie,
}

export { type MediaType } from '@/integrations/plex/client'
