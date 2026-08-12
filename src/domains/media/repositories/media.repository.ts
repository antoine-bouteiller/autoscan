import { and, asc, count, eq } from 'drizzle-orm'
import { Effect } from 'effect'

import { DatabaseQueryError } from '@/config/db'
import { Database } from '@/core/runtime.service'
import { media as mediaTable } from '@/database/schema'
import { type MediaType } from '@/integrations/plex/plex.service'
import { type ISOCode1 } from '@/shared/types/iso_codes'

const query = <Result>(run: () => Promise<Result>) => Effect.tryPromise({ catch: (cause) => new DatabaseQueryError(cause), try: run })

export const countMediaByType = (type: MediaType) =>
  Database.use(({ db }) => query(() => db.select({ count: count() }).from(mediaTable).where(eq(mediaTable.type, type))))

export const createdOrUpdatedMedia = (params: { tmdbId: number; type: MediaType; title: string; originalLanguage: ISOCode1 }) =>
  Database.use(({ db }) =>
    query(() =>
      db
        .insert(mediaTable)
        .values({
          originalLanguage: params.originalLanguage,
          preferredLanguage: params.originalLanguage,
          title: params.title,
          tmdbId: params.tmdbId,
          type: params.type,
        })
        .onConflictDoUpdate({
          set: { originalLanguage: params.originalLanguage, preferredLanguage: params.originalLanguage, title: params.title },
          target: [mediaTable.tmdbId, mediaTable.type],
        })
    )
  )

export const getMediaByIdAndType = (tmdbId: number, type: MediaType) =>
  Database.use(({ db }) =>
    query(() =>
      db
        .select()
        .from(mediaTable)
        .where(and(eq(mediaTable.tmdbId, tmdbId), eq(mediaTable.type, type)))
    ).pipe(Effect.map((rows) => rows[0]))
  )

export const getMediaByTypeWithPagination = (type: MediaType, page: number, pageSize: number) =>
  Database.use(({ db }) =>
    query(() =>
      db
        .select()
        .from(mediaTable)
        .where(eq(mediaTable.type, type))
        .orderBy(asc(mediaTable.title))
        .offset(pageSize * page)
        .limit(pageSize)
    )
  )
