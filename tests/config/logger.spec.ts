import { afterEach, beforeEach, jest, spyOn } from 'bun:test'

import { describe, expect, it } from '@tests/it'
import { Effect } from 'effect'

import { LoggerLive, nativeLogger } from '@/config/logger'

const logCause = <Failure>(effect: Effect.Effect<never, Failure>) =>
  effect.pipe(Effect.catchCause((cause) => Effect.logError(cause, 'failed').pipe(Effect.annotateLogs('context', ['Boundary']))))

describe('logger', () => {
  let output: string[]

  beforeEach(() => {
    output = []
    const captureOutput = (...values: unknown[]) => {
      output.push(values.map(String).join(' '))
    }

    spyOn(console, 'info').mockImplementation(captureOutput)
    spyOn(console, 'warn').mockImplementation(captureOutput)
    spyOn(console, 'error').mockImplementation(captureOutput)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders native log levels and messages', () => {
    nativeLogger.info('ready')
    nativeLogger.warn('careful')
    nativeLogger.error(new Error('boom'))

    expect(output).toEqual([
      expect.stringMatching(/\[INFO\].*ready$/),
      expect.stringMatching(/\[WARN\].*careful$/),
      expect.stringMatching(/\[ERROR\].*boom$/),
    ])
  })

  it('renders ordered native context with the existing parenthesis spacing', () => {
    nativeLogger.info('ready', 'Feature', 'Sub')
    nativeLogger.info('(detail) ready', 'Feature')

    expect(output).toEqual([
      expect.stringMatching(/\[INFO\].*\(Feature\)\(Sub\) ready$/),
      expect.stringMatching(/\[INFO\].*\(Feature\)\(detail\) ready$/),
    ])
  })

  it.effect('renders Effect logs with ordered context', () =>
    Effect.gen(function* () {
      yield* Effect.logInfo('ready').pipe(Effect.annotateLogs('context', ['Feature', 'Sub']), Effect.provide(LoggerLive))

      expect(output).toEqual([expect.stringMatching(/\[INFO\].*\(Feature\)\(Sub\) ready$/)])
    })
  )

  it.effect('renders typed failures and defects', () =>
    Effect.gen(function* () {
      yield* Effect.all([logCause(Effect.fail('typed')), logCause(Effect.die('defect'))], { discard: true }).pipe(Effect.provide(LoggerLive))

      expect(output).toHaveLength(2)
      expect(output).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/\[ERROR\].*\(Boundary\) failed: Error: typed/),
          expect.stringMatching(/\[ERROR\].*\(Boundary\) failed: Error: defect/),
        ])
      )
    })
  )
})
