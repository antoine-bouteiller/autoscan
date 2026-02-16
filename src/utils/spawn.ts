import { Effect } from 'effect'

import { CommandExecutionError } from '@/errors'

const buildCommandErrorMessage = (command: string | undefined, exitCode?: number, stderr?: string) => {
  const parts = ['Command execution failed']
  if (command) {
    parts.push(`command: ${command}`)
  }
  if (exitCode !== undefined) {
    parts.push(`exit code: ${exitCode}`)
  }
  if (stderr) {
    parts.push(`stderr: ${stderr}`)
  }
  return parts.join(', ')
}

export const spawn = (
  command: string,
  args: string[] = [],
  options: Omit<Parameters<typeof Bun.spawn>[1], 'stderr' | 'stdout'> = {}
): Effect.Effect<string, CommandExecutionError> =>
  Effect.tryPromise({
    try: async () => {
      const proc = Bun.spawn([command, ...args], {
        stderr: 'pipe',
        stdout: 'pipe',
        ...options,
      })

      const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])

      if (exitCode !== 0) {
        throw new CommandExecutionError({
          command: `${command} ${args.join(' ')}`,
          exitCode,
          message: buildCommandErrorMessage(`${command} ${args.join(' ')}`, exitCode, stderr),
          stderr,
        })
      }

      return stdout
    },
    catch: (error) => {
      if (error instanceof CommandExecutionError) {
        return error
      }
      const commandText = `${command} ${args.join(' ')}`
      return new CommandExecutionError({
        command: commandText,
        message: buildCommandErrorMessage(commandText, undefined, error instanceof Error ? error.message : 'Unknown error'),
        stderr: error instanceof Error ? error.message : 'Unknown error',
      })
    },
  })
