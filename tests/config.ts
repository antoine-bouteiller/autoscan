import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test as base } from 'vitest'

interface TestContext {
  testDir: string
}

const test = base.extend<TestContext>({
  // eslint-disable-next-line no-empty-pattern
  testDir: async ({}, use) => {
    const testDir = join(import.meta.dirname, randomUUID())

    mkdirSync(testDir, { recursive: true })

    await use(testDir)

    rmSync(testDir, { recursive: true })
  },
})

export const videosPath = join(import.meta.dirname, 'videos')

export { test }
