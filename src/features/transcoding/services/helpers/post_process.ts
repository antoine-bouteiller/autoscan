import { createReadStream, createWriteStream } from 'node:fs'
import { open, readdir, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'

import { Cause, Effect, Result } from 'effect'

import env from '@/config/env'
import { Ffmpeg, Plex, Radarr, Sonarr } from '@/core/runtime.service'
import {
  AudioStreamNotFoundError,
  FileAccessError,
  FileNotFoundError,
  ReplacementRollbackError,
  VideoStreamNotFoundError,
} from '@/features/transcoding/errors'
import { safeExistsSync } from '@/shared/utils/fs'

const fsync = async (path: string): Promise<void> => {
  const handle = await open(path, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

interface ReplacementOperations {
  readonly copyFile: (source: string, destination: string, signal: AbortSignal) => Promise<void>
  readonly exists: typeof safeExistsSync
  readonly fsync: typeof fsync
  readonly remove: typeof rm
  readonly rename: typeof rename
}

const liveReplacementOperations: ReplacementOperations = {
  copyFile: (source, destination, signal) => pipeline(createReadStream(source), createWriteStream(destination), { signal }),
  exists: safeExistsSync,
  fsync,
  remove: rm,
  rename,
}

const interruptibleCopy = (operations: ReplacementOperations, source: string, destination: string) =>
  Effect.callback<void, FileAccessError>((resume, signal) => {
    const copy = Promise.resolve().then(() => operations.copyFile(source, destination, signal))
    copy.then(
      () => resume(Effect.void),
      (error) => resume(Effect.fail(new FileAccessError({ cause: error, filePath: destination, operation: 'stage replacement' })))
    )
    return Effect.promise(() =>
      copy.then(
        () => undefined,
        () => undefined
      )
    )
  })

const durableOperation = <Success>(filePath: string, operation: string, run: () => Promise<Success>) =>
  Effect.uninterruptible(
    Effect.tryPromise({
      catch: (cause) => new FileAccessError({ cause, filePath, operation }),
      try: run,
    })
  )

export const replaceOutputs = (
  inputFile: string,
  outputDirectory: string,
  options: { operations?: ReplacementOperations; outputFiles: string[] }
) => {
  const { operations = liveReplacementOperations, outputFiles } = options
  const inputDirectory = dirname(inputFile)
  const transactionId = crypto.randomUUID()
  const outputs = outputFiles.map((name) => ({
    final: join(inputDirectory, name),
    source: join(outputDirectory, name),
    stage: join(inputDirectory, `.${name}.autoscan-stage-${transactionId}`),
  }))
  const originalPaths = [...new Set([inputFile, ...outputs.map((output) => output.final).filter(operations.exists)])]
  const backups = originalPaths.map((path) => ({ backup: `${path}.autoscan-backup-${transactionId}`, original: path }))
  const artifacts = [
    ...outputs.flatMap((output) => [output.source, output.stage, output.final]),
    ...backups.flatMap((backup) => [backup.original, backup.backup]),
  ]
  let preserveArtifacts = false

  const stage = Effect.gen(function* () {
    for (const output of outputs) {
      yield* interruptibleCopy(operations, output.source, output.stage)
      yield* durableOperation(output.stage, 'fsync replacement stage', () => operations.fsync(output.stage))
    }
    yield* durableOperation(inputDirectory, 'fsync replacement directory', () => operations.fsync(inputDirectory))
  })

  const commit = Effect.uninterruptible(
    Effect.tryPromise({
      catch: (cause) =>
        cause instanceof ReplacementRollbackError || cause instanceof FileAccessError
          ? cause
          : new FileAccessError({ cause, filePath: inputFile, operation: 'commit replacement' }),
      try: async () => {
        const backedUp: typeof backups = []
        const installed: string[] = []
        const rollback = async () => {
          try {
            for (const finalPath of installed) {
              await operations.remove(finalPath, { force: true })
            }
            for (const backup of backedUp.toReversed()) {
              await operations.rename(backup.backup, backup.original)
            }
            await operations.fsync(inputDirectory)
          } catch (error) {
            preserveArtifacts = true
            throw new ReplacementRollbackError({ artifacts, cause: error })
          }
        }
        try {
          for (const backup of backups) {
            await operations.rename(backup.original, backup.backup)
            backedUp.push(backup)
          }
          await operations.fsync(inputDirectory)
          for (const output of outputs) {
            await operations.rename(output.stage, output.final)
            installed.push(output.final)
          }
          await operations.fsync(inputDirectory)
        } catch (error) {
          await rollback()
          throw new FileAccessError({ cause: error, filePath: inputFile, operation: 'commit replacement' })
        }
      },
    })
  )

  const deleteBackups = Effect.tryPromise({
    catch: (cause) => new FileAccessError({ cause, filePath: inputFile, operation: 'delete replacement backups' }),
    try: async () => {
      for (const backup of backups) {
        await operations.remove(backup.backup)
      }
      await operations.fsync(inputDirectory)
    },
  })

  const cleanStages = Effect.ignore(
    Effect.tryPromise({
      catch: (cause) => new FileAccessError({ cause, filePath: inputFile, operation: 'clean replacement stages' }),
      try: async () => {
        for (const output of outputs) {
          await operations.remove(output.stage, { force: true })
        }
      },
    })
  )

  return Effect.gen(function* () {
    yield* stage
    yield* commit
    const cleanup = yield* Effect.result(deleteBackups)
    return Result.isFailure(cleanup) ? cleanup.failure : undefined
  }).pipe(Effect.ensuring(Effect.suspend(() => (preserveArtifacts ? Effect.void : cleanStages))))
}

const installTranscode = (inputFile: string, mediaTitle: string) =>
  Effect.gen(function* () {
    const outputDirectory = `${env.TRANSCODE_PATH}/${basename(inputFile, inputFile.slice(inputFile.lastIndexOf('.')))}`
    if (!safeExistsSync(outputDirectory)) {
      return { cleanupErrors: [], committed: false } as const
    }

    const outputFiles = (yield* Effect.tryPromise({
      catch: (cause) => new FileAccessError({ cause, filePath: outputDirectory, operation: 'readdir' }),
      try: () => readdir(outputDirectory),
    })).filter((file) => !file.startsWith('.autoscan-'))
    const videoFile = outputFiles.find((file) => file.endsWith('.mp4'))
    if (videoFile === undefined) {
      return yield* new FileNotFoundError({ filePath: outputDirectory })
    }

    const ffmpeg = yield* Ffmpeg
    const probe = yield* ffmpeg.ffprobe(join(outputDirectory, videoFile))
    if (!probe.streams.some((stream) => stream.codec_type === 'video')) {
      return yield* new VideoStreamNotFoundError({ mediaTitle })
    }
    if (!probe.streams.some((stream) => stream.codec_type === 'audio')) {
      return yield* new AudioStreamNotFoundError({ language: 'unknown', mediaTitle })
    }

    const cleanupErrors: FileAccessError[] = []
    const backupCleanupError = yield* replaceOutputs(inputFile, outputDirectory, { outputFiles })
    if (backupCleanupError !== undefined) {
      cleanupErrors.push(backupCleanupError)
    }
    const directoryCleanup = yield* Effect.result(
      Effect.tryPromise({
        catch: (cause) => new FileAccessError({ cause, filePath: outputDirectory, operation: 'remove' }),
        try: () => rm(outputDirectory, { recursive: true }),
      })
    )
    if (Result.isFailure(directoryCleanup)) {
      cleanupErrors.push(directoryCleanup.failure)
    }
    return { cleanupErrors, committed: true } as const
  })

export const handlePostTranscode = (params: { filePath: string; mediaTitle: string; mediaType: 'movie' | 'show' }) =>
  Effect.gen(function* () {
    const installation = yield* installTranscode(params.filePath, params.mediaTitle)
    if (!installation.committed) {
      return
    }
    for (const error of installation.cleanupErrors) {
      yield* Effect.logError(Cause.fail(error), 'postTranscode', params.mediaTitle)
    }

    if (params.mediaType === 'movie') {
      const radarr = yield* Radarr
      const movieId = yield* radarr.getMovieByPath(params.filePath)
      if (movieId === undefined) {
        yield* Effect.logWarning(`Could not find movie in Radarr for path: ${params.filePath}`).pipe(
          Effect.annotateLogs('context', ['postTranscode', params.mediaTitle])
        )
        return
      }
      yield* radarr.refreshMovie(movieId)
      yield* radarr.renameMovie(movieId)
    } else {
      const sonarr = yield* Sonarr
      const seriesId = yield* sonarr.getSeriesByPath(params.filePath)
      if (seriesId === undefined) {
        yield* Effect.logWarning(`Could not find series in Sonarr for path: ${params.filePath}`).pipe(
          Effect.annotateLogs('context', ['postTranscode', params.mediaTitle])
        )
        return
      }
      yield* sonarr.refreshSeries(seriesId)
      yield* sonarr.renameSeries(seriesId)
    }

    const plex = yield* Plex
    yield* plex.refreshSections(params.filePath, params.mediaType)
  })
