import { type } from 'arktype'

const episodeValidator = type({
  title: 'string',
})

const episodeFileValidator = type({
  relativePath: 'string',
})

const seriesPayloadValidator = type({
  path: 'string',
  title: 'string',
  tmdbId: 'string.numeric.parse | number',
})

export const sonarrValidator = type({
  episodeFile: episodeFileValidator,
  episodes: episodeValidator.array(),
  eventType: "'Download'",
  series: seriesPayloadValidator,
})
  .or({
    'episodeFile?': episodeFileValidator,
    eventType: "'EpisodeFileDelete' | 'Rename'",
    series: seriesPayloadValidator,
  })
  .or({
    eventType: "'SeriesDelete'",
    series: seriesPayloadValidator,
  })
  .or({
    eventType: "'Test'",
  })

export const seriesValidator = type({
  id: 'number',
  path: 'string',
})
