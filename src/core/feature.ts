import { type z } from 'zod'

import { container, TOKENS } from '#/core/container'
import { type HttpProvider } from '#/providers/http/http.provider'
import { type RouteHandler } from '#/providers/http/types'
import { type CommandHandler, type Conversation } from '#/providers/telegram/telegram.provider'

type FeatureRoute = (http: HttpProvider) => void

interface FeatureJob {
  readonly handler: () => Promise<void> | void
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

export const defineFeature = (feature: Feature): Feature => feature

export const postRoute =
  <TSchema extends z.ZodType>(path: string, validator: TSchema, handler: RouteHandler<z.output<TSchema>>): FeatureRoute =>
  (http) =>
    http.post(path, validator, handler)

export const registerFeatures = (features: readonly Feature[]): void => {
  const http = container.resolve(TOKENS.HTTP_PROVIDER)
  const scheduler = container.resolve(TOKENS.SCHEDULER_PROVIDER)
  const telegram = container.resolve(TOKENS.TELEGRAM_PROVIDER)

  for (const feature of features) {
    for (const route of feature.routes ?? []) {
      route(http)
    }
    for (const job of feature.jobs ?? []) {
      scheduler.register(job)
    }
    for (const [command, handler] of Object.entries(feature.commands ?? {})) {
      telegram.registerCommand(command, handler)
    }
    for (const [command, conversation] of Object.entries(feature.conversations ?? {})) {
      telegram.registerConversation(command, conversation)
    }
  }
}
