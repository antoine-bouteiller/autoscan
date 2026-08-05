import { Data } from 'effect'

interface CommandExecutionErrorFields {
  readonly cause?: unknown
  readonly command: string
  readonly exitCode: number
  readonly stderr: string
}

export class CommandExecutionError extends Data.TaggedError('CommandExecutionError')<CommandExecutionErrorFields & { readonly message: string }> {
  constructor(fields: CommandExecutionErrorFields) {
    super({ ...fields, message: `Command ${fields.command} failed with exit code ${fields.exitCode}: ${fields.stderr}` })
  }
}
