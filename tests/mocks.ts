import { mock } from 'bun:test'

mock.module('@/config/env', () => ({
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

mock.module('@/app/services/integrations/plex_service', () => ({
  getPlexMetadata: mockGetPlexMetadata,
  getSectionMedia: mockGetSectionMedia,
  getSections: mockGetSections,
  refreshSection: mockRefreshSection,
  updateStream: mockUpdateStream,
}))

export const mockGetTmdbMedia = mock()

mock.module('@/app/services/integrations/tmdb_service', () => ({
  getTmdbMedia: mockGetTmdbMedia,
}))

export const mockGetPublicIP = mock()
export const mockGetZoneId = mock()
export const mockGetARecord = mock()
export const mockUpdateDnsRecord = mock()

mock.module('@/app/services/integrations/cloudflare_service', () => ({
  getARecord: mockGetARecord,
  getPublicIP: mockGetPublicIP,
  getZoneId: mockGetZoneId,
  updateDnsRecord: mockUpdateDnsRecord,
}))

export const mockSonarrGetQueue = mock()
export const mockSonarrRemoveQueueItem = mock()

mock.module('@/app/services/integrations/sonarr_service', () => ({
  getQueue: mockSonarrGetQueue,
  removeQueueItem: mockSonarrRemoveQueueItem,
}))

export const mockRadarrGetQueue = mock()
export const mockRadarrRemoveQueueItem = mock()

mock.module('@/app/services/integrations/radarr_service', () => ({
  getQueue: mockRadarrGetQueue,
  removeQueueItem: mockRadarrRemoveQueueItem,
}))
