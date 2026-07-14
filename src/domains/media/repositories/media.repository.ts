import { and, asc, count, eq } from 'drizzle-orm'

import { db } from '@/config/db'
import { media as mediaTable } from '@/database/schema'
import { type MediaType } from '@/integrations/plex/plex.service'
import { type ISOCode1 } from '@/shared/types/iso_codes'

export const countMediaByType = (type: MediaType) => db.select({ count: count() }).from(mediaTable).where(eq(mediaTable.type, type))

export const createdOrUpdatedMedia = (params: { tmdbId: number; type: MediaType; title: string; originalLanguage: ISOCode1 }) =>
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

export const getMediaByIdAndType = async (tmdbId: number, type: MediaType) => {
  const result = await db
    .select()
    .from(mediaTable)
    .where(and(eq(mediaTable.tmdbId, tmdbId), eq(mediaTable.type, type)))

  return result[0]
}

export const getMediaByTypeWithPagination = (type: MediaType, page: number, pageSize: number) =>
  db
    .select()
    .from(mediaTable)
    .where(eq(mediaTable.type, type))
    .orderBy(asc(mediaTable.title))
    .offset(pageSize * page)
    .limit(pageSize)
