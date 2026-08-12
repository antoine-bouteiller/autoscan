import { Effect, Stream } from 'effect'
import { ChildProcess } from 'effect/unstable/process'

import { CommandExecutionError } from '@/shared/errors/command'

const FORCE_KILL_AFTER = 5000

interface SpawnParams {
  readonly args?: readonly string[]
  readonly command: string
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly timeout?: number
}

export const spawn = (params: SpawnParams) => {
  const args = params.args ?? []
  const commandText = `${params.command} ${args.join(' ')}`.trim()
  const failure = (fields: { cause?: unknown; exitCode: number; stderr: string }) => new CommandExecutionError({ ...fields, command: commandText })

  const execute = Effect.gen(function* () {
    const handle = yield* ChildProcess.make(params.command, [...args], {
      cwd: params.cwd,
      env: params.env,
      extendEnv: true,
      forceKillAfter: FORCE_KILL_AFTER,
      stdin: 'ignore',
    })
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [Stream.mkString(Stream.decodeText(handle.stdout)), Stream.mkString(Stream.decodeText(handle.stderr)), handle.exitCode],
      { concurrency: 'unbounded' }
    )
    return exitCode === 0 ? stdout : yield* failure({ exitCode, stderr })
  }).pipe(
    Effect.scoped,
    Effect.mapError((error) => (error instanceof CommandExecutionError ? error : failure({ cause: error, exitCode: 1, stderr: String(error) })))
  )

  return params.timeout === undefined
    ? execute
    : execute.pipe(Effect.timeoutOrElse({ duration: params.timeout, orElse: () => Effect.fail(failure({ exitCode: 1, stderr: 'Timed out' })) }))
}
