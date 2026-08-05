import { type Effect } from 'effect'

import { type AppRequirements } from '@/core/runtime.service'

export interface AppRequest<TBody = unknown> {
  body: TBody
}

export interface AppReply {
  status: (code: number) => AppReply
  send: (data: unknown) => void
}

export type RouteHandler<TBody = unknown> = (request: AppRequest<TBody>, reply: AppReply) => Effect.Effect<void, unknown, AppRequirements>
