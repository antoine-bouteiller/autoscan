import { createTaggedError } from '#utils/error'

export class CommandExecutionError extends createTaggedError({
  message: 'Command $command failed with exit code $exitCode: $stderr',
  name: 'CommandExecutionError',
}) {}
