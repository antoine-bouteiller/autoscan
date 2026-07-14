import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'

import { FileAccessError } from '@/features/transcoding/errors'

const tryCatch = <Result>(filePath: string, operation: string, fn: () => Result): Result | FileAccessError => {
  try {
    return fn()
  } catch (error) {
    return new FileAccessError({ cause: error, filePath, operation })
  }
}

export const safeReadFileSync = (filePath: string): string | FileAccessError => tryCatch(filePath, 'read', () => readFileSync(filePath, 'utf8'))

export const safeCopyFileSync = (source: string, destination: string): void | FileAccessError =>
  tryCatch(source, 'copy', () => copyFileSync(source, destination))

export const safeRenameSync = (source: string, destination: string): void | FileAccessError =>
  tryCatch(source, 'rename', () => renameSync(source, destination))

export const safeMkdirSync = (dirPath: string): void | FileAccessError =>
  tryCatch(dirPath, 'mkdir', () => {
    mkdirSync(dirPath, { recursive: true })
  })

export const safeReaddirSync = (dirPath: string): string[] | FileAccessError => tryCatch(dirPath, 'readdir', () => readdirSync(dirPath))

export const safeRmSync = (filePath: string, options?: { recursive?: boolean }): void | FileAccessError =>
  tryCatch(filePath, 'remove', () => rmSync(filePath, options))

export const safeExistsSync = (filePath: string): boolean => existsSync(filePath)
