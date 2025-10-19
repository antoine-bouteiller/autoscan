import { and, asc, count, eq } from 'drizzle-orm'

import type { MediaType } from '@/types/plex'

import { db } from '@/config/db'
import { media as mediaTable } from '@/db/schema'

export function countMediaByType(type: MediaType) {
  return db.select({ count: count() }).from(mediaTable).where(eq(mediaTable.type, type))
}

export function createdOrUpdatedMedia(
  tmdbId: number,
  type: MediaType,
  title: string,
  originalLanguage: string
) {
  return db
    .insert(mediaTable)
    .values({ tmdbId, originalLanguage, title, type })
    .onConflictDoUpdate({
      set: { originalLanguage, title },
      target: [mediaTable.tmdbId, mediaTable.type],
    })
}

export async function getMediaByIdAndType(tmdbId: number, type: MediaType) {
  return db
    .select()
    .from(mediaTable)
    .where(and(eq(mediaTable.tmdbId, tmdbId), eq(mediaTable.type, type)))
    .then((res) => res[0])
}

export function getMediaByTypeWithPagination(type: MediaType, page: number, pageSize: number) {
  return db
    .select()
    .from(mediaTable)
    .where(eq(mediaTable.type, type))
    .orderBy(asc(mediaTable.title))
    .offset(pageSize * page)
    .limit(pageSize)
}
