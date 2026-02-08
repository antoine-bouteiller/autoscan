import { ArkErrors } from 'arktype'

import { badRequest } from '@/core/response'

import type { Context, Next } from './types'

export const withValidation =
  <T>(validator: (data: unknown) => T | ArkErrors) =>
  async (ctx: Context, next: Next): Promise<Response> => {
    const body = await ctx.request.json().catch(() => ({}))
    const result = validator(body)

    if (result instanceof ArkErrors) {
      return badRequest('Validation failed', result.summary)
    }

    ctx.state['validatedBody'] = result
    return next()
  }
