import { type } from 'arktype'

export const radarrValidator = type({
  eventType: "'MovieFileDelete'",
  movie: {
    folderPath: 'string',
    title: 'string',
    tmdbId: 'number',
  },
  'movieFile?': {
    relativePath: 'string',
  },
})
  .or({
    deleteFiles: 'boolean',
    eventType: "'MovieDelete'",
    movie: {
      folderPath: 'string',
      title: 'string',
      tmdbId: 'number',
    },
  })
  .or({
    eventType: "'Download'",
    movie: {
      folderPath: 'string',
      title: 'string',
      tmdbId: 'number',
    },
    movieFile: {
      relativePath: 'string',
    },
  })
  .or({
    eventType: "'Test'",
  })
