import { Cause, Effect, FiberSet, Layer, Option, Ref, Semaphore } from 'effect'

import { Plex, TranscodeQueue, TranscodeScan } from '@/core/runtime.service'
import { getCompleteMediaDetails } from '@/domains/media/services/metadata.service'
import { transcodeFile } from '@/features/transcoding/services/transcode.service'

export const TranscodeScanLive = Layer.effect(
  TranscodeScan,
  Effect.gen(function* () {
    const semaphore = yield* Semaphore.make(1)
    const admission = yield* Semaphore.make(1)
    const running = yield* Ref.make(false)
    const accepting = yield* Ref.make(true)
    const fibers = yield* FiberSet.make()
    return TranscodeScan.of({
      awaitEmpty: FiberSet.awaitEmpty(fibers),
      clear: FiberSet.clear(fibers),
      isRunning: Ref.get(running),
      run: (effect) =>
        Effect.acquireUseRelease(
          admission.withPermits(1)(
            Ref.get(accepting).pipe(Effect.flatMap((isAccepting) => (isAccepting ? semaphore.takeIfAvailable(1) : Effect.succeed(false))))
          ),
          (acquired) =>
            acquired
              ? Ref.set(running, true).pipe(
                  Effect.flatMap(() => effect),
                  Effect.map(Option.some)
                )
              : Effect.succeed(Option.none()),
          (acquired) =>
            acquired
              ? Ref.set(running, false).pipe(
                  Effect.flatMap(() => semaphore.release(1)),
                  Effect.asVoid
                )
              : Effect.void
        ),
      start: (effect) =>
        admission.withPermits(1)(
          Effect.uninterruptible(
            Effect.gen(function* () {
              if (!(yield* Ref.get(accepting)) || !(yield* semaphore.takeIfAvailable(1))) {
                return false
              }
              yield* Ref.set(running, true)
              yield* FiberSet.run(
                fibers,
                effect.pipe(
                  Effect.catchCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause) : Effect.logError(cause, 'Transcode Scan'))),
                  Effect.ensuring(
                    Ref.set(running, false).pipe(
                      Effect.flatMap(() => semaphore.release(1)),
                      Effect.asVoid
                    )
                  )
                )
              )
              return true
            })
          )
        ),
      stopIntake: admission.withPermits(1)(Ref.set(accepting, false)),
    })
  })
)

const scan = Effect.gen(function* () {
  yield* Effect.logInfo('Starting transcode scan...')
  const plex = yield* Plex
  const sections = yield* plex.getSections
  for (const section of sections) {
    const medias = yield* plex.getSectionMedia(section.key, section.type)
    for (const media of medias) {
      yield* getCompleteMediaDetails(Number(media.ratingKey)).pipe(
        Effect.flatMap((details) =>
          transcodeFile({
            file: details.file,
            mediaTitle: details.mediaTitle,
            mediaType: details.mediaType,
            originalLanguage: details.originalLanguage,
          })
        ),
        Effect.catchCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause) : Effect.logError(cause, 'runTranscodeProcess')))
      )
    }
  }
  yield* Effect.logInfo('Transcode scan finished')
})

export const runTranscodeProcess = Effect.gen(function* () {
  const scans = yield* TranscodeScan
  const result = yield* scans.run(scan)
  if (Option.isNone(result)) {
    yield* Effect.logWarning('Transcode scan is already running, skipping...')
  }
})

export const startTranscodeProcess = Effect.gen(function* () {
  const scans = yield* TranscodeScan
  return yield* scans.start(scan)
})

export const getTranscodingStatus = Effect.gen(function* () {
  const scans = yield* TranscodeScan
  const queue = yield* TranscodeQueue
  const [isScanning, queueStatus] = yield* Effect.all([scans.isRunning, queue.status])
  return isScanning || queueStatus.isProcessing
})
