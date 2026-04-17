import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'

import { container, TOKENS } from '#core/container'
import { handlePostTranscode } from '#features/transcoding/services/helpers/post_process'

import { refreshSectionsMock } from '../../../../mocks/plex.mock.js'
import '../../../../utils.ts'

describe('handlePostTranscode', () => {
  const radarrClient = container.resolve(TOKENS.RADARR_CLIENT)
  const sonarrClient = container.resolve(TOKENS.SONARR_CLIENT)
  const plexClient = container.resolve(TOKENS.PLEX_CLIENT)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('movie: should refresh and rename when Radarr returns movieId', async () => {
    const getMovieByPath = vi.spyOn(radarrClient, 'getMovieByPath').mockResolvedValue(7)
    const refreshMovie = vi.spyOn(radarrClient, 'refreshMovie').mockResolvedValue()
    const renameMovie = vi.spyOn(radarrClient, 'renameMovie').mockResolvedValue()

    await handlePostTranscode({ filePath: '/movies/file.mp4', mediaTitle: 'Title', mediaType: 'movie' })

    expect(getMovieByPath).toHaveBeenCalledWith('/movies/file.mp4')
    expect(refreshMovie).toHaveBeenCalledWith(7)
    expect(renameMovie).toHaveBeenCalledWith(7)
    expect(refreshSectionsMock).toHaveBeenCalledWith('/movies/file.mp4', 'movie')
  })

  test('movie: should skip refresh when Radarr has no movie for path', async () => {
    vi.spyOn(radarrClient, 'getMovieByPath').mockResolvedValue(undefined)
    const refreshMovie = vi.spyOn(radarrClient, 'refreshMovie').mockResolvedValue()

    await handlePostTranscode({ filePath: '/movies/file.mp4', mediaTitle: 'Title', mediaType: 'movie' })

    expect(refreshMovie).not.toHaveBeenCalled()
    expect(refreshSectionsMock).not.toHaveBeenCalled()
  })

  test('show: should refresh and rename when Sonarr returns seriesId', async () => {
    const getSeriesByPath = vi.spyOn(sonarrClient, 'getSeriesByPath').mockResolvedValue(9)
    const refreshSeries = vi.spyOn(sonarrClient, 'refreshSeries').mockResolvedValue()
    const renameSeries = vi.spyOn(sonarrClient, 'renameSeries').mockResolvedValue()

    await handlePostTranscode({ filePath: '/shows/ep.mp4', mediaTitle: 'Title', mediaType: 'show' })

    expect(getSeriesByPath).toHaveBeenCalledWith('/shows/ep.mp4')
    expect(refreshSeries).toHaveBeenCalledWith(9)
    expect(renameSeries).toHaveBeenCalledWith(9)
    expect(refreshSectionsMock).toHaveBeenCalledWith('/shows/ep.mp4', 'show')
  })

  test('show: should skip refresh when Sonarr has no series for path', async () => {
    vi.spyOn(sonarrClient, 'getSeriesByPath').mockResolvedValue(undefined)
    const refreshSeries = vi.spyOn(sonarrClient, 'refreshSeries').mockResolvedValue()

    await handlePostTranscode({ filePath: '/shows/ep.mp4', mediaTitle: 'Title', mediaType: 'show' })

    expect(refreshSeries).not.toHaveBeenCalled()
    expect(refreshSectionsMock).not.toHaveBeenCalled()
  })

  test('should not touch plex.refreshSections when cleanup returns early', async () => {
    vi.spyOn(radarrClient, 'getMovieByPath').mockResolvedValue(undefined)
    vi.spyOn(plexClient, 'refreshSections')

    await handlePostTranscode({ filePath: '/movies/missing.mp4', mediaTitle: 'Title', mediaType: 'movie' })

    expect(refreshSectionsMock).not.toHaveBeenCalled()
  })
})
