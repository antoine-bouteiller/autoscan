import { CommandExecutionError } from '@/shared/errors/command'

interface SpawnOptions {
  cwd?: string
  env?: Record<string, string | undefined>
}

export const spawnPromise = async (command: string, args: string[] = [], options: SpawnOptions = {}): Promise<CommandExecutionError | string> => {
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
