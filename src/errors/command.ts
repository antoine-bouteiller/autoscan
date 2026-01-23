import { AppError } from './base'

export class CommandExecutionError extends AppError {
  constructor(
    public readonly command?: string,
    public readonly exitCode?: number,
    public readonly stderr?: string
  ) {
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
    super(parts.join(', '))
  }
}
