import { type } from 'arktype'

export const movieValidator = type({
  id: 'number',
  path: 'string',
})

export type Movie = typeof movieValidator.infer
