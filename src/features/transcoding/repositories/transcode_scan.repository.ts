import { and, eq } from 'drizzle-orm'
import { Effect } from 'effect'

import { DatabaseQueryError } from '@/config/db'
import { Database } from '@/core/runtime.service'
import { transcodeScans } from '@/database/schema'

export type TranscodeScanRecord = typeof transcodeScans.$inferSelect
export type TranscodeScanKey = Pick<TranscodeScanRecord, 'filePath' | 'originalLanguage' | 'scanVersion'>

const query = <Result>(run: () => Promise<Result>) => Effect.tryPromise({ catch: (cause) => new DatabaseQueryError(cause), try: run })

export const getScan = (key: TranscodeScanKey) =>
  Database.use(({ db }) =>
    query(() =>
      db
        .select()
        .from(transcodeScans)
        .where(
          and(
            eq(transcodeScans.filePath, key.filePath),
            eq(transcodeScans.originalLanguage, key.originalLanguage),
            eq(transcodeScans.scanVersion, key.scanVersion)
          )
        )
    ).pipe(Effect.map((rows) => rows[0]))
  )

export const recordScan = (row: TranscodeScanRecord) =>
  Database.use(({ db }) => query(() => db.insert(transcodeScans).values(row).onConflictDoUpdate({ set: row, target: transcodeScans.filePath }))).pipe(
    Effect.asVoid
  )
