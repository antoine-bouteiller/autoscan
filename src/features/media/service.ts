import { and, asc, count, eq } from 'drizzle-orm'

import type { MediaType } from '@/integrations/plex/client'
import type { ISOCode1 } from '@/types/iso_codes'

import { db } from '@/config/db'
import { media as mediaTable } from '@/database/schema'

export const countMediaByType = (type: MediaType) => db.select({ count: count() }).from(mediaTable).where(eq(mediaTable.type, type))

export const createdOrUpdatedMedia = (tmdbId: number, type: MediaType, title: string, originalLanguage: ISOCode1) =>
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
