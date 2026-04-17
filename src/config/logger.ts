/* oxlint-disable no-console */

type LogLevel = 'DEBUG' | 'ERROR' | 'INFO' | 'WARN'

const ANSI = {
  BOLD: '\x1b[1m',
  CYAN: '\x1b[36m',
  GRAY: '\x1b[90m',
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  RESET: '\x1b[0m',
  YELLOW: '\x1b[33m',
} as const

type ConsoleMethod = 'debug' | 'error' | 'info' | 'warn'

const LOG_CONFIG: Record<LogLevel, { color: string; method: ConsoleMethod }> = {
  DEBUG: { color: ANSI.CYAN, method: 'debug' },
  ERROR: { color: ANSI.RED, method: 'error' },
  INFO: { color: ANSI.GREEN, method: 'info' },
  WARN: { color: ANSI.YELLOW, method: 'warn' },
}

const formatContext = (context: string[], message: string): string => {
  const contextString = context.map((ctx) => `(${ctx})`).join('')
  const spacer = message.startsWith('(') ? '' : ' '
  return contextString + spacer
}

const prettyLog = (level: LogLevel, message: string, context: string[]): void => {
  if (process.env['NODE_ENV'] === 'test') {
    return
  }

  const { color, method } = LOG_CONFIG[level]
  const timestamp = new Date().toLocaleString('fr-FR')
  const formattedContext = formatContext(context, message)

  const formattedMessage = `${ANSI.GRAY}${timestamp}${ANSI.RESET} ${color}${ANSI.BOLD}[${level}]${ANSI.RESET} ${formattedContext}${message}`

  console[method](formattedMessage)
}

export const logger = {
  error: (message: string, ...context: string[]) => prettyLog('ERROR', message, context),
  info: (message: string, ...context: string[]) => prettyLog('INFO', message, context),
  warn: (message: string, ...context: string[]) => prettyLog('WARN', message, context),
}
