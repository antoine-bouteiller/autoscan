import { existsSync, readFileSync } from 'node:fs'
import { mkdir as mkdirPromise, readdir as readdirPromise, rename as renamePromise, rm, writeFile as writeFilePromise } from 'node:fs/promises'

import { Effect } from 'effect'

import { FileAccessError } from '@/features/transcoding/errors'

export const mkdir = (directory: string) =>
  Effect.tryPromise({
    catch: (cause) => new FileAccessError({ cause, filePath: directory, operation: 'mkdir' }),
    try: () => mkdirPromise(directory, { recursive: true }).then(() => undefined),
  })

export const rename = (source: string, destination: string) =>
  Effect.tryPromise({
    catch: (cause) => new FileAccessError({ cause, filePath: source, operation: 'rename' }),
    try: () => renamePromise(source, destination),
  })

export const writeFile = (filePath: string, contents: string) =>
  Effect.tryPromise({
    catch: (cause) => new FileAccessError({ cause, filePath, operation: 'write' }),
    try: () => writeFilePromise(filePath, contents),
  })

export const readdir = (directory: string) =>
  Effect.tryPromise({
    catch: (cause) => new FileAccessError({ cause, filePath: directory, operation: 'readdir' }),
    try: () => readdirPromise(directory),
  })

export const remove = (filePath: string, options?: { recursive?: boolean }) =>
  Effect.tryPromise({
    catch: (cause) => new FileAccessError({ cause, filePath, operation: 'remove' }),
    try: () => rm(filePath, options),
  })

export const exists = (filePath: string) => Effect.sync(() => existsSync(filePath))

export const safeReadFileSync = (filePath: string): string | FileAccessError => {
  try {
    return readFileSync(filePath, 'utf8')
  } catch (error) {
    return new FileAccessError({ cause: error, filePath, operation: 'read' })
  }
}

export const safeExistsSync = (filePath: string): boolean => existsSync(filePath)
