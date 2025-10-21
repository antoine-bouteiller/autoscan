import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach } from 'bun:test'

interface TestContext {
  testDir: string
}

const testContexts = new Map<string, TestContext>()

export const setupTestContext = function setupTestContext(testId: string) {
  beforeEach(() => {
    const testDir = join(import.meta.dirname, randomUUID())
    mkdirSync(testDir, { recursive: true })
    testContexts.set(testId, { testDir })
  })

  afterEach(() => {
    const context = testContexts.get(testId)
    if (context) {
      rmSync(context.testDir, { recursive: true })
      testContexts.delete(testId)
    }
  })

  return () => {
    const context = testContexts.get(testId)
    if (!context) {
      throw new Error(`Test context not found for test: ${testId}`)
    }
    return context
  }
}

export const videosPath = join(import.meta.dirname, 'videos')
