import { logger } from '#config/logger'
import type { TaggedErrorClass } from '#types/error'

const parseVariables = (message: string): string[] => {
  const vars: string[] = []
  const regex = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g
  let match
  while ((match = regex.exec(message)) !== null) {
    if (match[1] !== undefined) {
      vars.push(match[1])
    }
  }
  return vars
}

const RESERVED_KEYS = new Set(['_tag', 'messageTemplate', 'fingerprint', 'name', 'stack'])

const safeStringify = (value: unknown): string => {
  if (['number', 'string', 'null'].includes(typeof value)) {
    return String(value)
  }

  return JSON.stringify(value)
}

const interpolateMessage = (template: string, values: Record<string, unknown>): string =>
  template.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, varName) => {
    const value = values[varName]

    return value !== undefined ? safeStringify(value) : `$${varName}`
  })

export const createTaggedError = <Tag extends string, Msg extends string>({
  name,
  message,
}: {
  name: Tag
  message: Msg
}): TaggedErrorClass<Tag, Msg> => {
  const varNames = parseVariables(message)

  class TaggedError extends Error {
    readonly _tag: Tag = name

    constructor(args?: Record<string, unknown>) {
      const interpolatedMessage = args ? interpolateMessage(message, args) : message
      const cause = args?.['cause']

      super(interpolatedMessage, cause !== undefined ? { cause } : undefined)

      if (args) {
        for (const varName of varNames) {
          if (varName in args && !RESERVED_KEYS.has(varName)) {
            // oxlint-disable-next-line no-unsafe-type-assertion
            ;(this as Record<string, unknown>)[varName] = args[varName]
          }
        }
      }

      Object.setPrototypeOf(this, new.target.prototype)
      this.name = name

      if (cause instanceof Error && cause.stack) {
        const indented = cause.stack.replace(/\n/g, '\n  ')
        this.stack = `${this.stack}\nCaused by: ${indented}`
      }
    }
  }

  // oxlint-disable-next-line no-unsafe-type-assertion
  return TaggedError as unknown as TaggedErrorClass<Tag, Msg>
}

export const isError = <V>(v: V): v is Extract<V, Error> => v instanceof Error

export const isOk = <V>(v: V): v is Exclude<V, Error> => !(v instanceof Error)

export const logError = (error: unknown, ...context: string[]): void => {
  if (error instanceof Error) {
    const { cause, message } = error
    const fullMessage = cause && typeof cause === 'object' && 'message' in cause ? `${message}: ${String(cause.message)}` : message
    logger.error(fullMessage, ...context)
  } else {
    logger.error(JSON.stringify(error), ...context)
  }
}
