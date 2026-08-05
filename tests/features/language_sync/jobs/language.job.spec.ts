import { describe, expect, test } from 'bun:test'

import { runTest } from '@tests/effect'
import { MockPlexClient } from '@tests/mocks/plex.mock'
import { Effect } from 'effect'

import { updatePlexSelectedLanguages } from '@/features/language_sync/jobs/language.job'

class EmptyPlexClient extends MockPlexClient {
  override getSections() {
    return Effect.succeed([])
  }
}

describe('updatePlexSelectedLanguages', () => {
  test('handles an empty library', async () => {
    expect(await runTest(updatePlexSelectedLanguages, { plex: new EmptyPlexClient() })).toBeUndefined()
  })

  test('continues through the mock library', async () => {
    expect(await runTest(updatePlexSelectedLanguages, { plex: new MockPlexClient() })).toBeUndefined()
  })
})
