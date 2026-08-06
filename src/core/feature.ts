import { type Effect, type Schema } from 'effect'
import { type HttpRouter } from 'effect/unstable/http'

import { type AppRequirements } from '@/core/runtime.service'
import { type HttpProvider } from '@/providers/http/http.provider'
import { type RouteHandler } from '@/providers/http/types'
import { type SchedulerProvider } from '@/providers/scheduler/scheduler.provider'
import { type CommandHandler, type Conversation, type TelegramProvider } from '@/providers/telegram/telegram.provider'

type FeatureRoute = (http: HttpProvider) => void

interface FeatureJob {
  readonly handler: Effect.Effect<void, unknown, AppRequirements>
  readonly name: string
  readonly pattern: string
}

interface Feature {
  readonly commands?: Readonly<Record<string, CommandHandler>>
  readonly conversations?: Readonly<Record<string, Conversation>>
  readonly jobs?: readonly FeatureJob[]
  readonly name: string
  readonly routes?: readonly FeatureRoute[]
}

interface FeatureProviders {
  readonly http: HttpProvider
  readonly scheduler: SchedulerProvider
  readonly telegram: TelegramProvider
}

export const defineFeature = (feature: Feature): Feature => feature

export const postRoute =
  <TSchema extends Schema.ConstraintDecoder<unknown>>(
    path: HttpRouter.PathInput,
    validator: TSchema,
    handler: RouteHandler<TSchema['Type']>
  ): FeatureRoute =>
  (http) =>
    http.post(path, validator, handler)

export const registerFeatures = (features: readonly Feature[], providers: FeatureProviders): void => {
  for (const feature of features) {
    for (const route of feature.routes ?? []) {
      route(providers.http)
    }
    for (const job of feature.jobs ?? []) {
      providers.scheduler.register(job)
    }
    for (const [command, handler] of Object.entries(feature.commands ?? {})) {
      providers.telegram.registerCommand(command, handler)
    }
    for (const [command, conversation] of Object.entries(feature.conversations ?? {})) {
      providers.telegram.registerConversation(command, conversation)
    }
  }
}
