import { type } from 'arktype'

export const seriesValidator = type({
  id: 'number',
  path: 'string',
})

export type Series = typeof seriesValidator.infer
