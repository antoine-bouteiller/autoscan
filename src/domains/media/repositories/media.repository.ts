import { Effect } from 'effect'

import { DatabaseQueryError } from '@/config/db'
import { Database } from '@/core/runtime.service'
import { type Media } from '@/database/schema'
import { type MediaType } from '@/integrations/plex/plex.service'
import { type ISOCode1 } from '@/shared/types/iso_codes'

const query = <Result>(run: () => Promise<Result>) => Effect.tryPromise({ catch: (cause) => DatabaseQueryError.make({ cause }), try: run })

/** @internal */
export const countMediaByType = (type: MediaType) =>
  Database.use(({ sql }) => query(() => sql<{ count: number }[]>`SELECT count(*)::int AS count FROM media WHERE type = ${type}`))

export const createdOrUpdatedMedia = (params: { tmdbId: number; type: MediaType; title: string; originalLanguage: ISOCode1 }) =>
  Database.use(({ sql }) =>
    query(
      () => sql`
        INSERT INTO media (tmdb_id, type, title, original_language, preferred_language)
        VALUES (${params.tmdbId}, ${params.type}, ${params.title}, ${params.originalLanguage}, ${params.originalLanguage})
        ON CONFLICT (tmdb_id, type) DO UPDATE SET
          title = EXCLUDED.title,
          original_language = EXCLUDED.original_language,
          preferred_language = EXCLUDED.preferred_language
      `
    )
  )

export const getMediaByIdAndType = (tmdbId: number, type: MediaType) =>
  Database.use(({ sql }) =>
    query(
      () => sql<Media[]>`
        SELECT tmdb_id AS "tmdbId", type, title, original_language AS "originalLanguage", preferred_language AS "preferredLanguage"
        FROM media
        WHERE tmdb_id = ${tmdbId} AND type = ${type}
      `
    ).pipe(Effect.map((rows) => rows[0]))
  )

export const getMediaByTypeWithPagination = (type: MediaType, page: number, pageSize: number) =>
  Database.use(({ sql }) =>
    query(
      () => sql<Media[]>`
        SELECT tmdb_id AS "tmdbId", type, title, original_language AS "originalLanguage", preferred_language AS "preferredLanguage"
        FROM media
        WHERE type = ${type}
        ORDER BY title ASC
        LIMIT ${pageSize} OFFSET ${pageSize * page}
      `
    )
  )
