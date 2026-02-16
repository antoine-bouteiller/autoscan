import { and, asc, count, eq } from 'drizzle-orm'
import { Effect } from 'effect'

import { DatabaseService } from '@/config/database'
import { media as mediaTable } from '@/database/schema'
import type { MediaType } from '@/schemas/plex'
import type { ISOCode1 } from '@/types/iso_codes'

export class MediaRepository extends Effect.Service<MediaRepository>()('MediaRepository', {
  accessors: true,
  dependencies: [DatabaseService.Default],
  effect: Effect.gen(function* () {
    const db = yield* DatabaseService

    const countMediaByType = Effect.fn('MediaRepository.countMediaByType')(function* (type: MediaType) {
      return yield* Effect.promise(async () => {
        const result = await db.select({ count: count() }).from(mediaTable).where(eq(mediaTable.type, type))
        return result[0]?.count ?? 0
      })
    })

    const createOrUpdateMedia = Effect.fn('MediaRepository.createOrUpdateMedia')(function* (
      tmdbId: number,
      type: MediaType,
      title: string,
      originalLanguage: ISOCode1
    ) {
      yield* Effect.promise(() =>
        db
          .insert(mediaTable)
          .values({
            originalLanguage,
            preferredLanguage: originalLanguage,
            title,
            tmdbId,
            type,
          })
          .onConflictDoUpdate({
            set: { originalLanguage, preferredLanguage: originalLanguage, title },
            target: [mediaTable.tmdbId, mediaTable.type],
          })
      )
    })

    const getMediaByIdAndType = Effect.fn('MediaRepository.getMediaByIdAndType')(function* (tmdbId: number, type: MediaType) {
      return yield* Effect.promise(async () => {
        const result = await db
          .select()
          .from(mediaTable)
          .where(and(eq(mediaTable.tmdbId, tmdbId), eq(mediaTable.type, type)))
        return result[0]
      })
    })

    const getMediaByTypeWithPagination = Effect.fn('MediaRepository.getMediaByTypeWithPagination')(function* (
      type: MediaType,
      page: number,
      pageSize: number
    ) {
      return yield* Effect.promise(() =>
        db
          .select()
          .from(mediaTable)
          .where(eq(mediaTable.type, type))
          .orderBy(asc(mediaTable.title))
          .offset(pageSize * page)
          .limit(pageSize)
      )
    })

    return {
      countMediaByType,
      createOrUpdateMedia,
      getMediaByIdAndType,
      getMediaByTypeWithPagination,
    }
  }),
}) {}
