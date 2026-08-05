import { Effect, Option } from 'effect'

import { CommandExecutionError } from '@/shared/errors/command'

interface SpawnOptions {
  cwd?: string
  env?: Record<string, string | undefined>
  timeout?: number
}

const terminate = (process: ReturnType<typeof Bun.spawn>) =>
  Effect.suspend(() => {
    if (process.exitCode !== null) {
      return Effect.void
    }

    process.kill('SIGTERM')
    return Effect.promise(() => process.exited).pipe(
      Effect.timeoutOption(5000),
      Effect.flatMap((exit) => {
        if (Option.isSome(exit)) {
          return Effect.void
        }
        process.kill('SIGKILL')
        return Effect.promise(() => process.exited).pipe(Effect.asVoid)
      })
    )
  })

export const spawn = (command: string, args: readonly string[] = [], options: SpawnOptions = {}) => {
  const commandText = `${command} ${args.join(' ')}`.trim()
  const acquire = Effect.try({
    catch: (cause) => new CommandExecutionError({ cause, command: commandText, exitCode: 1, stderr: String(cause) }),
    try: () =>
      Bun.spawn([command, ...args], {
        cwd: options.cwd,
        env: options.env === undefined ? undefined : { ...process.env, ...options.env },
        stderr: 'pipe',
        stdin: 'ignore',
        stdout: 'pipe',
      }),
  })

  const execute = Effect.acquireUseRelease(
    acquire,
    (process) =>
      Effect.tryPromise({
        catch: (cause) =>
          cause instanceof CommandExecutionError
            ? cause
            : new CommandExecutionError({ cause, command: commandText, exitCode: process.exitCode ?? 1, stderr: String(cause) }),
        try: async () => {
          const [stdout, stderr, exitCode] = await Promise.all([
            new Response(process.stdout).text(),
            new Response(process.stderr).text(),
            process.exited,
          ])
          if (exitCode !== 0) {
            throw new CommandExecutionError({ command: commandText, exitCode: exitCode || 1, stderr })
          }
          return stdout
        },
      }),
    terminate
  )

  return options.timeout === undefined
    ? execute
    : execute.pipe(
        Effect.timeoutOrElse({
          duration: options.timeout,
          orElse: () => Effect.fail(new CommandExecutionError({ command: commandText, exitCode: 1, stderr: 'Timed out' })),
        })
      )
}
