import { createTaggedError } from '#/shared/utils/error'

export class CommandExecutionError extends createTaggedError({
  message: 'Command $command failed with exit code $exitCode: $stderr',
  name: 'CommandExecutionError',
}) {}
