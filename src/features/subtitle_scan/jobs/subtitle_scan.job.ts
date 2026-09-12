import { Cause, Effect, Layer, Option, Semaphore } from 'effect'
import { isFailure } from 'effect/Exit'

import { Env } from '@/config/env'
import { BackgroundTasks, Bazarr, Plex, SubtitleScan } from '@/core/runtime.service'
import { getCompleteMediaDetails } from '@/domains/media/services/metadata.service'
import { applyFrenchProfilePolicy } from '@/features/subtitle_scan/services/french_profile.service'
import { applyMissingPolicy } from '@/features/subtitle_scan/services/missing_subtitles.service'
import { scanMediaSubtitles } from '@/features/subtitle_scan/services/subtitle_scan.service'
import { type SubtitleScanMedia } from '@/features/subtitle_scan/types'

const catchAndLog = <Success, Error, Requirements>(effect: Effect.Effect<Success, Error, Requirements>, operation: string) =>
  effect.pipe(
    Effect.catchCauseIf(
      (cause) => !Cause.hasInterrupts(cause),
      (cause) => Effect.logError(cause, operation).pipe(Effect.as(undefined))
    )
  )

export const SubtitleScanLive = Layer.effect(SubtitleScan, Semaphore.make(1))

const resolveFrenchPreset = Effect.gen(function* () {
  const bazarr = yield* Bazarr
  const env = yield* Env
  const profiles = yield* catchAndLog(bazarr.getProfiles, 'Resolving Bazarr French profile')
  if (profiles === undefined) {
    return undefined
  }
  const preset = profiles.find((profile) => profile.name === env.BAZARR_FRENCH_PROFILE)
  if (preset === undefined) {
    yield* Effect.logWarning(`Bazarr French profile not found: ${env.BAZARR_FRENCH_PROFILE}`)
  }
  return preset?.profileId
})

const scanMedia = (details: SubtitleScanMedia, presetId: number | undefined) =>
  Effect.gen(function* () {
    const bazarr = yield* Bazarr
    const getItem = yield* Effect.cached(details.mediaType === 'movie' ? bazarr.getMovieByPath(details.file) : bazarr.getEpisodeByPath(details.file))
    yield* catchAndLog(scanMediaSubtitles(details, getItem), `Scanning subtitles for ${details.mediaTitle}`)
    yield* catchAndLog(applyFrenchProfilePolicy(details, getItem, presetId), `Applying French profile policy for ${details.mediaTitle}`)
  })

const traverse = (presetId: number | undefined) =>
  Effect.gen(function* () {
    const plex = yield* Plex
    const sections = yield* plex.getSections
    for (const section of sections) {
      const media = yield* catchAndLog(plex.getSectionMedia(section.key, section.type), `Listing Plex section ${section.title}`)
      if (media === undefined) {
        continue
      }
      for (const entry of media) {
        yield* getCompleteMediaDetails(Number(entry.ratingKey)).pipe(
          Effect.flatMap((details) => scanMedia(details, presetId)),
          (effect) => catchAndLog(effect, `Resolving Plex media ${entry.title}`)
        )
      }
    }
  })

const subtitleScan = Effect.gen(function* () {
  yield* Effect.logInfo('Starting subtitle scan...')
  const presetId = yield* resolveFrenchPreset
  yield* catchAndLog(traverse(presetId), 'Traversing Plex library for subtitle scan')
  yield* catchAndLog(applyMissingPolicy, 'Applying missing subtitle policy')
  yield* Effect.logInfo('Subtitle scan finished')
})

export const runSubtitleScan = Effect.gen(function* () {
  const gate = yield* SubtitleScan
  const result = yield* gate.withPermitsIfAvailable(1)(subtitleScan)
  if (Option.isNone(result)) {
    yield* Effect.logWarning('Subtitle scan is already running, skipping...')
  }
})

export const startSubtitleScan = Effect.uninterruptibleMask(() =>
  Effect.gen(function* () {
    const backgroundTasks = yield* BackgroundTasks
    const gate = yield* SubtitleScan
    if (!(yield* gate.takeIfAvailable(1))) {
      return false
    }
    const work = Effect.interruptible(subtitleScan).pipe(
      Effect.catchCauseIf(
        (cause) => !Cause.hasInterrupts(cause),
        (cause) => Effect.logError(cause, 'Subtitle Scan')
      ),
      Effect.ensuring(gate.release(1))
    )
    const submission = yield* Effect.exit(backgroundTasks.start(work))
    if (isFailure(submission)) {
      yield* gate.release(1)
      return yield* Effect.failCause(submission.cause)
    }
    if (!submission.value) {
      yield* gate.release(1)
    }
    return submission.value
  })
)
