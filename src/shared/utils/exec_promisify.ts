import { spawn } from 'node:child_process'

import { CommandExecutionError } from '#/shared/errors/command'

interface SpawnOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
}

export const spawnPromise = (command: string, args: string[] = [], options: SpawnOptions = {}): Promise<CommandExecutionError | string> =>
  new Promise((resolve) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    proc.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    proc.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    proc.on('close', (exitCode) => {
      const stdout = Buffer.concat(stdoutChunks).toString()
      const stderr = Buffer.concat(stderrChunks).toString()

      if (exitCode !== 0) {
        resolve(new CommandExecutionError({ command: `${command} ${args.join(' ')}`, exitCode: exitCode ?? 1, stderr }))
        return
      }

      resolve(stdout)
    })
  })
