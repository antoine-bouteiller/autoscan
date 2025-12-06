/* oxlint-disable no-console */

const getTimestamp = (): string => {
  const now = new Date()
  return now.toLocaleString('fr-FR')
}

const ANSI = {
  BLUE: '\x1b[34m',
  BOLD: '\x1b[1m',
  CYAN: '\x1b[36m',
  GRAY: '\x1b[90m',
  // Foreground Colors
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  // Styles
  RESET: '\x1b[0m',
  YELLOW: '\x1b[33m',
}

type LogLevel = 'DEBUG' | 'ERROR' | 'INFO' | 'WARN'

const prettyLog = (level: LogLevel, message: string, context: string[]): void => {
  const timestamp = getTimestamp()
  let color: string
  let printFunc: typeof console.log

  if (process.env.NODE_ENV == 'test') {
    return
  }

  // Determine color and console function based on level
  switch (level) {
    case 'DEBUG': {
      color = ANSI.CYAN
      printFunc = console.debug
      break
    }
    case 'ERROR': {
      color = ANSI.RED
      printFunc = console.error
      break
    }
    case 'INFO': {
      color = ANSI.GREEN
      printFunc = console.info
      break
    }
    case 'WARN': {
      color = ANSI.YELLOW
      printFunc = console.warn
      break
    }
    default: {
      color = ANSI.RESET
      printFunc = console.log
    }
  }

  const formattedContext =
    context.map((ctx) => `(${ctx})`).join('') + (message.startsWith('(') ? '' : ' ')

  const formattedMessage = `${ANSI.GRAY}${timestamp}${ANSI.RESET} ${color}${ANSI.BOLD}[${level}]${ANSI.RESET} ${formattedContext}${message}`

  printFunc(formattedMessage)
}

export const logger = {
  error: (message: string, ...context: string[]) => {
    prettyLog('ERROR', message, context)
  },
  info: (message: string, ...context: string[]) => {
    prettyLog('INFO', message, context)
  },
  warn: (message: string, ...context: string[]) => {
    prettyLog('WARN', message, context)
  },
}
