import { type } from 'arktype'

const movieValidator = type({
  folderPath: 'string',
  title: 'string',
  tmdbId: 'number',
})

const movieFileValidator = type({
  relativePath: 'string',
})

export const radarrValidator = type({
  eventType: "'MovieFileDelete'",
  movie: movieValidator,
  'movieFile?': movieFileValidator,
})
  .or({
    deleteFiles: 'boolean',
    eventType: "'MovieDelete'",
    movie: movieValidator,
  })
  .or({
    eventType: "'Download'",
    movie: movieValidator,
    movieFile: movieFileValidator,
  })
  .or({
    eventType: "'Test'",
  })
