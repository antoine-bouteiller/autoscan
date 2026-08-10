import { describe, expect, test } from 'bun:test'

import { Effect } from 'effect'

import { makeDatabaseResource } from '@/config/db'

const makeOperations = (events: string[], migrationFails = false) => ({
  close: async () => {
    events.push('close')
  },
  construct: () => {
    events.push('construct')
    return { kind: 'db' as const }
  },
  migrate: async () => {
    events.push('migrate')
    if (migrationFails) {
      throw new Error('migration failed')
    }
  },
  open: () => {
    events.push('open')
    return { kind: 'sql' as const }
  },
})

describe('database resource lifecycle', () => {
  test('closes once after successful scoped use', async () => {
    const events: string[] = []

    await Effect.runPromise(Effect.scoped(makeDatabaseResource(makeOperations(events))))

    expect(events).toEqual(['open', 'construct', 'migrate', 'close'])
  })

  test('closes once when migration fails', async () => {
    const events: string[] = []

    const exit = await Effect.runPromiseExit(Effect.scoped(makeDatabaseResource(makeOperations(events, true))))

    expect(exit._tag).toBe('Failure')
    expect(events).toEqual(['open', 'construct', 'migrate', 'close'])
  })
})
