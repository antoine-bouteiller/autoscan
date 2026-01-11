import { CommandError } from '@/errors'

export const spawnPromise = async (
  command: string,
  args: string[] = [],
  options: Omit<Parameters<typeof Bun.spawn>[1], 'stderr' | 'stdout'> = {}
): Promise<string> => {
  const proc = Bun.spawn([command, ...args], {
    stderr: 'pipe',
    stdout: 'pipe',
    ...options,
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  if (exitCode !== 0) {
    throw new CommandError('execution_failed', {
      command: `${command} ${args.join(' ')}`,
      exitCode,
      stderr,
    })
  }

  return stdout
}
