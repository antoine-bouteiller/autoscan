import { describe, expect, test } from 'bun:test'

import { Schema } from 'effect'

import { plexResponseValidator } from '@/integrations/plex/plex.validator'

describe('plexResponseValidator', () => {
  test('drops invalid stream entries', () => {
    const result = Schema.decodeUnknownSync(plexResponseValidator)({
      MediaContainer: {
        Metadata: [
          {
            Media: [
              {
                Part: [
                  {
                    Stream: [
                      { id: 10, streamType: 1, title: 'English' },
                      { id: 'invalid', streamType: 1 },
                    ],
                    file: '/media/movie.mkv',
                    id: 1,
                  },
                ],
              },
            ],
            key: '/library/metadata/1',
            ratingKey: '1',
            title: 'Example',
            type: 'movie',
            year: 2026,
          },
        ],
      },
    })

    expect(result.MediaContainer.Metadata?.[0]?.Media[0]?.Part[0]?.Stream).toEqual([{ id: 10, streamType: 1, title: 'English' }])
  })
})
