import { Cause, DateTime, Effect } from 'effect'

import { Env } from '@/config/env'
import { Bazarr, Telegram } from '@/core/runtime.service'
import {
  deleteMissing,
  insertMissing,
  listMissing,
  markMissingActed,
  type MissingSubtitleKey,
} from '@/features/subtitle_scan/repositories/subtitle_scan.repository'
import { type BazarrItem } from '@/integrations/bazarr/bazarr.service'

const THREE_DAYS = 3 * 86_400_000

const keyOf = ({ kind, id }: BazarrItem, language: string) => `${kind}:${id}:${language}`
const itemKeyOf = ({ kind, id }: BazarrItem) => `${kind}:${id}`

const logFailure = <Success, Error, Requirements>(effect: Effect.Effect<Success, Error, Requirements>, operation: string) =>
  effect.pipe(
    Effect.catchCauseIf(
      (cause) => !Cause.hasInterrupts(cause),
      (cause) => Effect.logError(cause, operation)
    )
  )

export const applyMissingPolicy = Effect.gen(function* () {
  const bazarr = yield* Bazarr
  const telegram = yield* Telegram
  const env = yield* Env

  // Both lists must be complete before durable state is changed.
  const [movies, episodes] = yield* Effect.all([bazarr.getWantedMovies, bazarr.getWantedEpisodes])
  const actedAt = yield* DateTime.nowAsDate
  const now = actedAt.getTime()
  const wanted = [...movies, ...episodes]
  const wantedByKey = new Map<string, { item: BazarrItem; key: MissingSubtitleKey }>()

  for (const item of wanted) {
    for (const missing of item.missingSubtitles.filter((subtitle) => !subtitle.forced)) {
      const key = keyOf(item, missing.language)
      if (!wantedByKey.has(key)) {
        wantedByKey.set(key, {
          item,
          key: { bazarrId: item.id, bazarrKind: item.kind, language: missing.language },
        })
      }
    }
  }

  const existing = yield* listMissing
  for (const entry of wantedByKey.values()) {
    yield* insertMissing({ ...entry.key, firstSeenAt: actedAt })
  }
  for (const row of existing) {
    if (!wantedByKey.has(`${row.bazarrKind}:${row.bazarrId}:${row.language}`)) {
      yield* deleteMissing(row)
    }
  }

  // Read again so newly inserted clocks participate only on a later pass.
  const rows = yield* listMissing
  const items = new Map<string, { item: BazarrItem; rows: typeof rows }>()
  for (const row of rows) {
    const entry = wantedByKey.get(`${row.bazarrKind}:${row.bazarrId}:${row.language}`)
    if (entry === undefined || row.actedAt !== null) {
      continue
    }
    const itemKey = itemKeyOf(entry.item)
    const group = items.get(itemKey)
    if (group === undefined) {
      items.set(itemKey, { item: entry.item, rows: [row] })
    } else {
      group.rows.push(row)
    }
  }

  for (const { item, rows: itemRows } of items.values()) {
    const due = itemRows.filter((row) => row.firstSeenAt.getTime() < now - THREE_DAYS)
    if (due.length === 0) {
      continue
    }

    const source = item.subtitles.find((subtitle) => !subtitle.forced)
    if (source === undefined) {
      const keys = itemRows.map(({ bazarrId, bazarrKind, language }) => ({ bazarrId, bazarrKind, language }))
      const languages = itemRows.map((row) => row.language).join(', ')
      yield* logFailure(
        telegram
          .sendMessage(env.TELEGRAM_CHAT_ID, `No subtitles for ${item.title} after 3 days (missing: ${languages})`)
          .pipe(Effect.flatMap(() => markMissingActed(keys, actedAt))),
        `Missing subtitle alert for ${item.title}`
      )
      continue
    }

    for (const row of due) {
      yield* logFailure(
        bazarr
          .translateSubtitle(item, source, row.language)
          .pipe(Effect.flatMap(() => markMissingActed([{ bazarrId: row.bazarrId, bazarrKind: row.bazarrKind, language: row.language }], actedAt))),
        `Missing subtitle translation for ${item.title} (${row.language})`
      )
    }
  }
})
