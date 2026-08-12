import { afterEach, beforeEach, jest, spyOn } from 'bun:test'
/* oxlint-disable no-console */

import { describe, expect, it } from '@tests/it'
import { Cause, Effect, Logger, References } from 'effect'

import { LoggerLive, nativeLogger } from '@/config/logger'

const logCause = (effect: Effect.Effect<never, Error>) =>
  effect.pipe(Effect.catchCause((cause) => Effect.logError(cause, 'failed').pipe(Effect.annotateLogs('context', ['Boundary']))))

describe('logger', () => {
  beforeEach(() => {
    spyOn(console, 'info').mockImplementation(() => undefined)
    spyOn(console, 'warn').mockImplementation(() => undefined)
    spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('routes native levels to their console methods', () => {
    nativeLogger.info('ready')
    nativeLogger.warn('careful')
    nativeLogger.error(new Error('boom'))

    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('[INFO]'))
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[WARN]'))
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'))
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('boom'))
  })

  it('renders ordered native context with the existing parenthesis spacing', () => {
    nativeLogger.info('ready', 'Feature', 'Sub')
    nativeLogger.info('(detail) ready', 'Feature')

    expect(console.info).toHaveBeenNthCalledWith(1, expect.stringContaining('(Feature)(Sub) ready'))
    expect(console.info).toHaveBeenNthCalledWith(2, expect.stringContaining('(Feature)(detail) ready'))
  })

  it.effect('renders Effect logs with ordered context', () =>
    Effect.gen(function* () {
      yield* Effect.logInfo('ready').pipe(Effect.annotateLogs('context', ['Feature', 'Sub']), Effect.provide(LoggerLive))

      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('(Feature)(Sub) ready'))
    })
  )

  it.effect('preserves typed failures and defects as structural Causes for injected loggers', () =>
    Effect.gen(function* () {
      const entries: { cause: Cause.Cause<unknown>; context: unknown; message: unknown }[] = []
      const capturingLogger = Logger.make<unknown, void>((options) => {
        entries.push({
          cause: options.cause,
          context: options.fiber.getRef(References.CurrentLogAnnotations)['context'],
          message: options.message,
        })
      })
      const typedError = new Error('typed')
      const defect = new Error('defect')

      yield* Effect.all([logCause(Effect.fail(typedError)), logCause(Effect.die(defect))], { discard: true }).pipe(
        Effect.provide(Logger.layer([capturingLogger]))
      )

      expect(entries).toHaveLength(2)
      expect(entries[0]?.message).toEqual(['failed'])
      expect(entries[0]?.context).toEqual(['Boundary'])
      expect(entries[0]?.cause.reasons.some((reason) => Cause.isFailReason(reason) && reason.error === typedError)).toBeTrue()
      expect(entries[1]?.cause.reasons.some((reason) => Cause.isDieReason(reason) && reason.defect === defect)).toBeTrue()
    })
  )
})
