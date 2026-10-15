import { Effect } from 'effect'

import { DatabaseQueryError } from '@/config/db'
import { Database } from '@/core/runtime.service'
import { type TranscodeScan } from '@/database/schema'

export type TranscodeScanRecord = TranscodeScan
export type TranscodeScanKey = Pick<TranscodeScanRecord, 'filePath' | 'originalLanguage' | 'scanVersion'>

const query = <Result>(run: () => Promise<Result>) => Effect.tryPromise({ catch: (cause) => new DatabaseQueryError(cause), try: run })

export const getScan = (key: TranscodeScanKey) =>
  Database.use(({ sql }) =>
    query(
      () => sql<TranscodeScanRecord[]>`
        SELECT file_path AS "filePath", original_language AS "originalLanguage", scan_version AS "scanVersion", scanned_at AS "scannedAt"
        FROM transcode_scans
        WHERE file_path = ${key.filePath} AND original_language = ${key.originalLanguage} AND scan_version = ${key.scanVersion}
      `
    ).pipe(Effect.map((rows) => rows[0]))
  )

export const recordScan = (row: TranscodeScanRecord) =>
  Database.use(({ sql }) =>
    query(
      () => sql`
        INSERT INTO transcode_scans (file_path, original_language, scan_version, scanned_at)
        VALUES (${row.filePath}, ${row.originalLanguage}, ${row.scanVersion}, ${row.scannedAt})
        ON CONFLICT (file_path) DO UPDATE SET
          original_language = EXCLUDED.original_language,
          scan_version = EXCLUDED.scan_version,
          scanned_at = EXCLUDED.scanned_at
      `
    )
  ).pipe(Effect.asVoid)
