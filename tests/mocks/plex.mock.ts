import { vi } from 'vitest'

import { PlexError } from '@/errors/plex'
import type { IPlexClient } from '@/integrations/plex.service'
import type { PlexMedia } from '@/validators/plex.validator'

import { plexMetadata } from '../resources/fixtures/plex.fixtures'

export const updateStreamMock = vi.fn()

export class MockPlexClient implements IPlexClient {
  async getPlexMetadata(ratingKey: number) {
    return plexMetadata[ratingKey] ?? new PlexError({ ratingKey })
  }

  getBasicMediaInfo(plexMedia: PlexMedia) {
    const part = plexMedia.Media?.[0]?.Part?.[0]
    return {
      file: part?.file,
      ratingKey: plexMedia.ratingKey,
      type: plexMedia.type === 'episode' ? ('show' as const) : plexMedia.type,
    }
  }

  async getSectionMedia(_id: number, _sectionType: 'movie' | 'show') {
    return []
  }

  async getSections() {
    return []
  }

  async refreshSection(_id: number, _filePath: string) {
    return
  }

  async updateStream(partsId: number, streamId: number, type: 'audio' | 'subtitle') {
    updateStreamMock(partsId, streamId, type)
  }
}
