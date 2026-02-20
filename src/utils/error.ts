import { logger } from '@/config/logger'
import type { TaggedErrorClass } from '@/types/error'

const findCause = <T extends Error>(error: Error, ErrorClass: new (...args: unknown[]) => T): T | undefined => {
  const seen = new Set<Error>()
  let current: unknown = error
  while (current instanceof Error) {
    if (seen.has(current)) {
      break
    }
    seen.add(current)
    if (current instanceof ErrorClass) {
      return current
    }
    current = current.cause
  }
  return undefined
}

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

const interpolateMessage = (template: string, values: Record<string, unknown>): string =>
  template.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, varName) => {
    const value = values[varName]
    return value !== undefined ? JSON.stringify(value) : `$${varName}`
  })

export const createTaggedError = <Tag extends string, Msg extends string, ErrorClass extends Error = Error>(opts: {
  name: Tag
  message: Msg
  extends?: ErrorClass
}): TaggedErrorClass<Tag, Msg, ErrorClass> => {
  const { name: tag, message: messageTemplate } = opts
  const varNames = parseVariables(messageTemplate)

  class TaggedError extends Error {
    readonly _tag: Tag = opts.name
    readonly messageTemplate: Msg = opts.message

    static readonly tag: Tag = opts.name

    constructor(args?: Record<string, unknown>) {
      const interpolatedMessage = args ? interpolateMessage(messageTemplate, args) : messageTemplate
      const cause = args && 'cause' in args ? args['cause'] : undefined

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
      this.name = tag

      if (cause instanceof Error && cause.stack) {
        const indented = cause.stack.replace(/\n/g, '\n  ')
        this.stack = `${this.stack}\nCaused by: ${indented}`
      }
    }

    static is(v: unknown): v is TaggedError {
      return v instanceof TaggedError
    }

    findCause<T extends Error>(ErrorClass: new (...args: unknown[]) => T): T | undefined {
      return findCause(this, ErrorClass)
    }
  }

  // oxlint-disable-next-line no-unsafe-type-assertion
  return TaggedError as unknown as TaggedErrorClass<Tag, Msg, ErrorClass>
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
