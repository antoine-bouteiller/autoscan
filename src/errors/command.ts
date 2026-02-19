import { AppError } from './base'

export class CommandExecutionError extends AppError {
  constructor(command?: string, exitCode?: number, stderr?: string) {
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
