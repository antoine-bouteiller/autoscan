import { type } from 'arktype'

const episodeValidator = type({
  title: 'string',
})

const episodeFileValidator = type({
  relativePath: 'string',
})

const seriesValidator = type({
  path: 'string',
  title: 'string',
  tmdbId: 'string.numeric.parse | number',
})

export const sonarrValidator = type({
  episodeFile: episodeFileValidator,
  episodes: episodeValidator.array(),
  eventType: "'Download'",
  series: seriesValidator,
})
  .or({
    'episodeFile?': episodeFileValidator,
    eventType: "'EpisodeFileDelete' | 'Rename'",
    series: seriesValidator,
  })
  .or({
    eventType: "'SeriesDelete'",
    series: seriesValidator,
  })
  .or({
    eventType: "'Test'",
  })
