import { Cause, DateTime, Logger, References } from 'effect'

const ANSI = {
  BOLD: '\x1b[1m',
  CYAN: '\x1b[36m',
  GRAY: '\x1b[90m',
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  RESET: '\x1b[0m',
  YELLOW: '\x1b[33m',
} as const

type LogLevel = 'DEBUG' | 'ERROR' | 'INFO' | 'WARN'
type ConsoleMethod = 'debug' | 'error' | 'info' | 'warn'

const LOG_CONFIG: Record<LogLevel, { color: string; method: ConsoleMethod }> = {
  DEBUG: { color: ANSI.CYAN, method: 'debug' },
  ERROR: { color: ANSI.RED, method: 'error' },
  INFO: { color: ANSI.GREEN, method: 'info' },
  WARN: { color: ANSI.YELLOW, method: 'warn' },
}

const formatContext = (context: readonly string[], message: string): string => {
  const contextString = context.map((item) => `(${item})`).join('')
  const spacer = message.startsWith('(') ? '' : ' '
  return contextString + spacer
}

const formatMessage = (message: unknown): string => {
  if (message instanceof Error) {
    const cause = message.cause instanceof Error ? `: ${message.cause.message}` : ''
    return `${message.message}${cause}`
  }
  if (typeof message === 'string') {
    return message
  }
  return JSON.stringify(message)
}

const write = (entry: { context: readonly string[]; date: DateTime.Utc; level: LogLevel; message: string }): void => {
  const { context, date, level, message } = entry
  const { color, method } = LOG_CONFIG[level]
  const timestamp = DateTime.formatLocal(date, { dateStyle: 'short', locale: 'fr-FR', timeStyle: 'medium' })
  const formattedContext = formatContext(context, message)
  console[method](`${ANSI.GRAY}${timestamp}${ANSI.RESET} ${color}${ANSI.BOLD}[${level}]${ANSI.RESET} ${formattedContext}${message}`)
}

const toLogLevel = (level: string): LogLevel => {
  if (level === 'DEBUG' || level === 'ERROR' || level === 'INFO' || level === 'WARN') {
    return level
  }
  return 'INFO'
}

const effectLogger = Logger.make<unknown, void>((options) => {
  const annotations = options.fiber.getRef(References.CurrentLogAnnotations)
  const annotatedContext = annotations['context']
  const context = Array.isArray(annotatedContext) ? annotatedContext.filter((item): item is string => typeof item === 'string') : []
  const messages = Array.isArray(options.message) ? options.message : [options.message]
  const message = messages.map(formatMessage).join(' ')
  const cause = options.cause.reasons.length === 0 ? '' : `: ${Cause.pretty(options.cause)}`
  write({ context, date: DateTime.makeUnsafe(options.date), level: toLogLevel(options.logLevel.toUpperCase()), message: `${message}${cause}` })
})

export const LoggerLive = Logger.layer([effectLogger])

export const nativeLogger = {
  error: (message: unknown, ...context: string[]) => write({ context, date: DateTime.nowUnsafe(), level: 'ERROR', message: formatMessage(message) }),
  info: (message: string, ...context: string[]) => write({ context, date: DateTime.nowUnsafe(), level: 'INFO', message }),
  warn: (message: string, ...context: string[]) => write({ context, date: DateTime.nowUnsafe(), level: 'WARN', message }),
}
