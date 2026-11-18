import { Effect } from 'effect'

import { DatabaseQueryError } from '@/config/db'
import { Database } from '@/core/runtime.service'
import { type TranscodeScan } from '@/database/schema'

export const hasTranscodeScan = (filePath: string, originalLanguage: TranscodeScan['originalLanguage']) =>
  Database.use(({ sql }) =>
    Effect.tryPromise({
      catch: (cause) => DatabaseQueryError.make({ cause }),
      try: () => sql<{ found: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM transcode_scans WHERE file_path = ${filePath} AND original_language = ${originalLanguage}
        ) AS found
      `,
    }).pipe(Effect.map((rows) => rows[0]?.found))
  )
