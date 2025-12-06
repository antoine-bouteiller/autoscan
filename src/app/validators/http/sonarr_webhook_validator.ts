import { type } from 'arktype'

const episodeType = type({
  title: 'string',
})

export const sonarrValidator = type({
  episodeFile: {
    relativePath: 'string',
  },
  episodes: episodeType.array(),
  eventType: "'Download'",
  series: {
    path: 'string',
    title: 'string',
    tmdbId: 'string.numeric.parse',
  },
})
  .or({
    'episodeFile?': {
      relativePath: 'string',
    },
    eventType: "'EpisodeFileDelete' | 'Rename'",
    series: {
      path: 'string',
      title: 'string',
      tmdbId: 'string.numeric.parse',
    },
  })
  .or({
    eventType: "'SeriesDelete'",
    series: {
      path: 'string',
      title: 'string',
      tmdbId: 'string.numeric.parse',
    },
  })
  .or({
    eventType: "'Test'",
  })
