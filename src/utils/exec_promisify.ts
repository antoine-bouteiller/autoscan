import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const promisifiedExec = promisify(exec)

export const execPromise = async (command: string) => {
  try {
    const { stdout } = await promisifiedExec(command)
    return stdout
  } catch (error) {
    if (error instanceof Error && 'stderr' in error) {
      throw new Error(String(error.stderr), { cause: error })
    }
    throw error
  }
}
