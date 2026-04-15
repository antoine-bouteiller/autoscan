export interface AppRequest {
  body: unknown
}

export interface AppReply {
  status(code: number): AppReply
  send(data: unknown): void
}

export type RouteHandler = (request: AppRequest, reply: AppReply) => Promise<void> | void
