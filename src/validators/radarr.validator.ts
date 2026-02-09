import { type } from 'arktype'

const moviePayloadValidator = type({
  folderPath: 'string',
  title: 'string',
  tmdbId: 'number',
})

const movieFileValidator = type({
  relativePath: 'string',
})

export const radarrValidator = type({
  eventType: "'MovieFileDelete'",
  movie: moviePayloadValidator,
  'movieFile?': movieFileValidator,
})
  .or({
    deleteFiles: 'boolean',
    eventType: "'MovieDelete'",
    movie: moviePayloadValidator,
  })
  .or({
    eventType: "'Download'",
    movie: moviePayloadValidator,
    movieFile: movieFileValidator,
  })
  .or({
    eventType: "'Test'",
  })

export const movieValidator = type({
  id: 'number',
  path: 'string',
})
