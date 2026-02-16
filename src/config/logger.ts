import { Effect, Layer, LogLevel, Logger } from 'effect'

import { AppConfig } from '@/config/app_config'

export const LoggerLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    const { NODE_ENV } = yield* AppConfig
    const logger = NODE_ENV === 'development' ? Logger.pretty : Logger.structured
    return Layer.merge(Logger.minimumLogLevel(LogLevel.Info), logger)
  })
)
