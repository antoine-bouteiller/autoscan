import { CommandExecutionError } from '#/shared/errors/command'

interface SpawnOptions {
  cwd?: string
  env?: Record<string, string | undefined>
}

const spawnWithBun = async (command: string, args: string[], options: SpawnOptions): Promise<CommandExecutionError | string> => {
  const proc = Bun.spawn([command, ...args], {
    cwd: options.cwd,
    env: options.env,
    stderr: 'pipe',
    stdin: 'ignore',
    stdout: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])

  if (exitCode !== 0) {
    return new CommandExecutionError({ command: `${command} ${args.join(' ')}`, exitCode: exitCode || 1, stderr })
  }

  return stdout
}

const spawnWithNode = async (command: string, args: string[], options: SpawnOptions): Promise<CommandExecutionError | string> => {
  const { spawn } = await import('node:child_process')

  return new Promise((resolve) => {
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
}

export const spawnPromise = (command: string, args: string[] = [], options: SpawnOptions = {}): Promise<CommandExecutionError | string> =>
  typeof Bun === 'undefined' ? spawnWithNode(command, args, options) : spawnWithBun(command, args, options)
