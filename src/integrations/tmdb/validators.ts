import { type } from 'arktype'

export const tmdbResponseValidator = type({
  languages: 'string[]',
  name: 'string',
  original_language: 'string',
  title: 'string',
})

export type TmdbResponse = typeof tmdbResponseValidator.infer
