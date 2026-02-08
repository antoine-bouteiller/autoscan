import type { Context, Middleware, Next } from './types'

export const compose =
  (middlewares: Middleware[]): Middleware =>
  (ctx: Context, next: Next): Promise<Response> => {
    let index = -1

    const dispatch = (i: number): Promise<Response> => {
      if (i <= index) {
        return Promise.reject(new Error('next() called multiple times'))
      }
      index = i

      const middleware = i < middlewares.length ? middlewares[i] : next

      if (!middleware) {
        return Promise.reject(new Error('No middleware or next function'))
      }

      return middleware(ctx, () => dispatch(i + 1))
    }

    return dispatch(0)
  }
