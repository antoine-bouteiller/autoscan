import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process'

export const spawnPromise = (
  command: string,
  args: string[] = [],
  options: SpawnOptionsWithoutStdio = {}
): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, options)
    let stdout = ''
    let stderr = ''

    if (child.stdout) {
      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
      })
    }

    if (child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })
    }

    child.on('error', (err: Error) => {
      reject(new Error(stderr || err.message, { cause: err }))
    })

    child.on('close', (code: null | number) => {
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new Error(stderr || `Command failed with exit code ${code}`))
      }
    })
  })
