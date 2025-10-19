import type { DestinationStream, LoggerOptions } from 'pino'

import { pino } from 'pino'

const optionsMap: Record<string, DestinationStream | LoggerOptions> = {
  development: {
    transport: {
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
      },
      target: 'pino-pretty',
    },
  },
  production: {},
  test: { level: 'silent' },
}

export const logger = pino(optionsMap[process.env.NODE_ENV ?? 'development'])
