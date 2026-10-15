import { Schema } from 'effect'

export class CommandExecutionError extends Schema.TaggedError<CommandExecutionError, { readonly brand: unique symbol }>()('CommandExecutionError', {
  cause: Schema.optional(Schema.Unknown),
  command: Schema.String,
  exitCode: Schema.Finite,
  stderr: Schema.String,
}) {
  override get message() {
    return `Command ${this.command} failed with exit code ${this.exitCode}: ${this.stderr}`
  }
}
