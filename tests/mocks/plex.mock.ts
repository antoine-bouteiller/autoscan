import { Effect, Layer } from 'effect'
import { vi } from 'vitest'

import { PlexClient } from '@/integrations/plex.service'

import { plexMetadata } from '../resources/fixtures/plex.fixtures'

export const updateStreamMock = vi.fn()

export const MockPlexLayer = Layer.succeed(
  PlexClient,
  PlexClient.make({
    getPlexMetadata: (ratingKey: number) => Effect.succeed(plexMetadata[ratingKey]),
    getBasicMediaInfo: (plexMedia) => {
      const part = plexMedia.Media?.[0]?.Part?.[0]
      return {
        file: part?.file,
        ratingKey: plexMedia.ratingKey,
        type: plexMedia.type === 'episode' ? ('show' as const) : plexMedia.type,
      }
    },
    getSectionMedia: () => Effect.succeed([]),
    getSections: () => Effect.succeed([]),
    refreshSection: () => Effect.void,
    updateStream: (partsId: number, streamId: number, type: 'audio' | 'subtitle') => {
      updateStreamMock(partsId, streamId, type)
      return Effect.void
    },
  })
)
