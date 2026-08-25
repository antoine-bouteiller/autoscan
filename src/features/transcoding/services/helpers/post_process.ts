import { Cause, Crypto, Effect, FileSystem, Option, Path, type PlatformError, Result } from 'effect'

import { Env } from '@/config/env'
import { Ffmpeg, Plex, Radarr, Sonarr } from '@/core/runtime.service'
import {
  AudioStreamNotFoundError,
  FileAccessError,
  FileNotFoundError,
  ReplacementRollbackError,
  VideoStreamNotFoundError,
} from '@/features/transcoding/errors'

interface ReplacementOperations {
  readonly copyFile: (source: string, destination: string) => Effect.Effect<void, PlatformError.PlatformError>
  readonly exists: (path: string) => Effect.Effect<boolean, PlatformError.PlatformError>
  readonly fsync: (path: string) => Effect.Effect<void, PlatformError.PlatformError>
  readonly remove: (path: string, options?: { force?: boolean; recursive?: boolean }) => Effect.Effect<void, PlatformError.PlatformError>
  readonly rename: (oldPath: string, newPath: string) => Effect.Effect<void, PlatformError.PlatformError>
}

const COPY_CHUNK_SIZE = 64 * 1024

const copyFileInterruptibly = (fs: FileSystem.FileSystem, source: string, destination: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const sourceFile = yield* fs.open(source, { flag: 'r' })
      const destinationFile = yield* fs.open(destination, { flag: 'w' })
      while (true) {
        const chunk = yield* sourceFile.readAlloc(COPY_CHUNK_SIZE)
        if (Option.isNone(chunk)) {
          break
        }
        yield* destinationFile.writeAll(chunk.value)
      }
    })
  )

const liveReplacementOperations: Effect.Effect<ReplacementOperations, never, FileSystem.FileSystem> = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  return {
    copyFile: (source, destination) => copyFileInterruptibly(fs, source, destination),
    exists: fs.exists,
    fsync: (path: string) => Effect.scoped(Effect.flatMap(fs.open(path), (file) => file.sync)),
    remove: fs.remove,
    rename: fs.rename,
  }
})

const durableOperation = (filePath: string, operation: string, run: Effect.Effect<void, PlatformError.PlatformError>) =>
  Effect.uninterruptible(Effect.mapError(run, (cause) => new FileAccessError({ cause, filePath, operation })))

export const replaceOutputs = (inputFile: string, outputDirectory: string, options: { operations?: ReplacementOperations; outputFiles: string[] }) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const crypto = yield* Crypto.Crypto
    const operations = options.operations ?? (yield* liveReplacementOperations)

    const inputDirectory = path.dirname(inputFile)
    const transactionId = yield* crypto.randomUUIDv4
    const outputs = options.outputFiles.map((name) => ({
      final: path.join(inputDirectory, name),
      source: path.join(outputDirectory, name),
      stage: path.join(inputDirectory, `.${name}.autoscan-stage-${transactionId}`),
    }))
    const finalPaths = outputs.map((output) => output.final)
    const finalPathExists = yield* Effect.forEach((filePath: string) => operations.exists(filePath))(finalPaths)
    const originalPaths = [...new Set([inputFile, ...finalPaths.filter((_outputPath, index) => finalPathExists[index])])]
    const backups = originalPaths.map((original) => ({ backup: `${original}.autoscan-backup-${transactionId}`, original }))
    const artifacts = [
      ...outputs.flatMap((output) => [output.source, output.stage, output.final]),
      ...backups.flatMap((backup) => [backup.original, backup.backup]),
    ]
    let preserveArtifacts = false

    const stage = Effect.gen(function* () {
      for (const output of outputs) {
        yield* Effect.mapError(
          operations.copyFile(output.source, output.stage),
          (cause) => new FileAccessError({ cause, filePath: output.stage, operation: 'stage replacement' })
        )
        yield* durableOperation(output.stage, 'fsync replacement stage', operations.fsync(output.stage))
      }
      yield* durableOperation(inputDirectory, 'fsync replacement directory', operations.fsync(inputDirectory))
    })

    const commit = Effect.uninterruptible(
      Effect.gen(function* () {
        const backedUp: typeof backups = []
        const installed: string[] = []

        const rollback = Effect.gen(function* () {
          for (const finalPath of installed) {
            yield* operations.remove(finalPath, { force: true })
          }
          for (const backup of backedUp.toReversed()) {
            yield* operations.rename(backup.backup, backup.original)
          }
          yield* operations.fsync(inputDirectory)
        }).pipe(
          Effect.catch((error) => {
            preserveArtifacts = true
            return Effect.fail(new ReplacementRollbackError({ artifacts, cause: error }))
          })
        )

        yield* Effect.gen(function* () {
          for (const backup of backups) {
            yield* operations.rename(backup.original, backup.backup)
            backedUp.push(backup)
          }
          yield* operations.fsync(inputDirectory)
          for (const output of outputs) {
            yield* operations.rename(output.stage, output.final)
            installed.push(output.final)
          }
          yield* operations.fsync(inputDirectory)
        }).pipe(
          Effect.catch((error) =>
            rollback.pipe(Effect.andThen(Effect.fail(new FileAccessError({ cause: error, filePath: inputFile, operation: 'commit replacement' }))))
          )
        )
      })
    )

    const deleteBackups = Effect.gen(function* () {
      for (const backup of backups) {
        yield* operations.remove(backup.backup)
      }
      yield* operations.fsync(inputDirectory)
    }).pipe(Effect.mapError((cause) => new FileAccessError({ cause, filePath: inputFile, operation: 'delete replacement backups' })))

    const cleanStages = Effect.ignore(Effect.forEach(outputs, (output) => operations.remove(output.stage, { force: true }), { discard: true }))

    return yield* Effect.gen(function* () {
      yield* stage
      yield* commit
      const cleanup = yield* Effect.result(deleteBackups)
      return Result.isFailure(cleanup) ? cleanup.failure : undefined
    }).pipe(Effect.ensuring(Effect.suspend(() => (preserveArtifacts ? Effect.void : cleanStages))))
  })

const installTranscode = (inputFile: string, mediaTitle: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const env = yield* Env
    const outputDirectory = `${env.TRANSCODE_PATH}/${path.basename(inputFile, inputFile.slice(inputFile.lastIndexOf('.')))}`
    if (!(yield* fs.exists(outputDirectory))) {
      return { cleanupErrors: [], committed: false } as const
    }

    const outputFiles = (yield* fs
      .readDirectory(outputDirectory)
      .pipe(Effect.mapError((cause) => new FileAccessError({ cause, filePath: outputDirectory, operation: 'readdir' })))).filter(
      (file) => !file.startsWith('.autoscan-')
    )
    const videoFile = outputFiles.find((file) => file.endsWith('.mp4'))
    if (videoFile === undefined) {
      return yield* new FileNotFoundError({ filePath: outputDirectory })
    }

    const ffmpeg = yield* Ffmpeg
    const probe = yield* ffmpeg.ffprobe(path.join(outputDirectory, videoFile))
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
      fs
        .remove(outputDirectory, { recursive: true })
        .pipe(Effect.mapError((cause) => new FileAccessError({ cause, filePath: outputDirectory, operation: 'remove' })))
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
