import { BaseError } from './base'

type CommandErrorCode = 'execution_failed' | 'validation_failed'

export class CommandError extends BaseError {
  readonly code: CommandErrorCode
  readonly context: {
    command?: string
    exitCode?: number
    stderr?: string
  }

  constructor(code: CommandErrorCode, details: { command?: string; exitCode?: number; stderr?: string }) {
    super()
    this.code = code
    this.context = details
    this.updateMessage()
  }

  format(): string {
    const { command, exitCode, stderr } = this.context

    if (this.code === 'execution_failed') {
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

    if (this.code === 'validation_failed') {
      return 'Command output validation failed'
    }

    return 'Command error'
  }
}
