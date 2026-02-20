import { createTaggedError } from '../utils/error'

export class CommandExecutionError extends createTaggedError({
  name: 'CommandExecutionError',
  message: 'Command $command failed with exit code $exitCode: $stderr',
}) {}
