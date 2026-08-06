import { describe, expect, test } from 'bun:test'

import { Result, Schema } from 'effect'

import { queueResponseValidator } from '@/integrations/arr/queue.types'

const queueItem = { id: 1, status: 'downloading', title: 'Example' }

describe('queueResponseValidator', () => {
  test('normalizes a null timeleft to undefined', () => {
    const input = { records: [{ ...queueItem, timeleft: JSON.parse('null') }], totalRecords: 1 }
    const result = Schema.decodeUnknownSync(queueResponseValidator)(input)
    expect(result.records[0]?.timeleft).toBeUndefined()
  })

  test('rejects an invalid timeleft', () => {
    const input = { records: [{ ...queueItem, timeleft: 42 }], totalRecords: 1 }
    expect(Result.isFailure(Schema.decodeUnknownResult(queueResponseValidator)(input))).toBe(true)
  })
})
