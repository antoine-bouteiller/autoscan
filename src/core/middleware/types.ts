export interface Context {
  request: Request
  state: Record<string, unknown>
}

export type Next = () => Promise<Response>

export type Middleware = (ctx: Context, next: Next) => Promise<Response>
