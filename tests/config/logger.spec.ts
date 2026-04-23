/* oxlint-disable no-console */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'

import { logger } from '#/config/logger'

describe('logger', () => {
  const originalEnv = process.env['NODE_ENV']

  beforeEach(() => {
    process.env['NODE_ENV'] = 'development'
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    process.env['NODE_ENV'] = originalEnv
    vi.restoreAllMocks()
  })

  test('should suppress output when NODE_ENV is test', () => {
    process.env['NODE_ENV'] = 'test'
    logger.info('hello')
    logger.warn('hello')
    logger.error('hello')
    expect(console.info).not.toHaveBeenCalled()
    expect(console.warn).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  test('should route info to console.info with [INFO] tag', () => {
    logger.info('ready')
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('[INFO]'))
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('ready'))
  })

  test('should route warn to console.warn with [WARN] tag', () => {
    logger.warn('careful')
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[WARN]'))
  })

  test('should route error to console.error with [ERROR] tag', () => {
    logger.error('boom')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'))
  })

  test('should render multiple context segments in order with trailing spacer', () => {
    logger.info('ready', 'Feature', 'Sub')
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('(Feature)(Sub) ready'))
  })

  test('should omit spacer when message starts with a parenthesis', () => {
    logger.info('(detail) ready', 'Feature')
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('(Feature)(detail) ready'))
  })
})
